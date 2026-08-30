#!/usr/bin/env python3
"""Collect dependency facts for every package in the repository.

Writes one JSON document. It measures; it never edits, installs or upgrades
anything. Every number the report prints must come from this file — if a value
is absent here, the report says "not measured", it does not estimate.

Usage:
    python3 collect.py --root . --out docs/dependencies/data/2026-08-27.json
    python3 collect.py --offline          # skip outdated/audit (the only network calls)
    python3 collect.py --packages server,client
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

sys.setrecursionlimit(20000)

SKIP_DIRS = {"node_modules", ".git", "dist", ".next", "build", "coverage", ".turbo", "clones"}
SRC_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
           # Tailwind v4 is pulled in by `@import "tailwindcss"` from CSS,
           # so a scanner that reads only TypeScript reports it as unused.
           ".css", ".scss"}
# Scanning these would make every dependency look "used": the package manifest
# and the lockfiles list every name by definition.
SCAN_EXCLUDE_NAMES = {"package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"}


def run(cmd, cwd=None, timeout=300):
    """Run a command. Returns (exit_code, stdout, stderr).

    macOS has no `timeout` binary, so the limit lives here, in Python.
    """
    try:
        p = subprocess.run(
            cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout
        )
        return p.returncode, p.stdout, p.stderr
    except subprocess.TimeoutExpired:
        return 124, "", f"timed out after {timeout}s"
    except FileNotFoundError as exc:
        return 127, "", str(exc)


def strip_jsonc(text):
    r"""tsconfig.json is JSONC. Remove comments and trailing commas.

    Scanned rather than regexed on purpose: this repository's tsconfig has
    "@devdigest/shared/*" as a path alias, and a `/\*.*?\*/` regex eats that
    string's `/*` and swallows the rest of the file. Comments are only comments
    outside a string literal.
    """
    out = []
    i, n = 0, len(text)
    in_string = escaped = False
    while i < n:
        ch = text[i]
        if in_string:
            out.append(ch)
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            i += 1
            continue
        if ch == '"':
            in_string = True
            out.append(ch)
            i += 1
            continue
        if ch == "/" and i + 1 < n and text[i + 1] == "/":
            while i < n and text[i] != "\n":
                i += 1
            continue
        if ch == "/" and i + 1 < n and text[i + 1] == "*":
            i += 2
            while i + 1 < n and not (text[i] == "*" and text[i + 1] == "/"):
                i += 1
            i += 2
            continue
        out.append(ch)
        i += 1
    return re.sub(r",(\s*[}\]])", r"\1", "".join(out))


def read_json(path, tolerant=False):
    try:
        raw = Path(path).read_text(errors="ignore")
        return json.loads(strip_jsonc(raw) if tolerant else raw)
    except Exception:
        return None


# --------------------------------------------------------------------------
# discovery
# --------------------------------------------------------------------------

def discover_packages(root):
    """Find packages on disk rather than trusting any documented list."""
    found = []
    for manifest in sorted(root.glob("*/package.json")):
        if "node_modules" in manifest.parts:
            continue
        data = read_json(manifest)
        if data is None:
            continue
        found.append({"dir": manifest.parent.name, "path": manifest.parent, "manifest": data})
    return found


def detect_manager(pkg_path):
    if (pkg_path / "pnpm-lock.yaml").exists():
        return "pnpm"
    if (pkg_path / "package-lock.json").exists():
        return "npm"
    return "unknown"


# --------------------------------------------------------------------------
# sizes
# --------------------------------------------------------------------------

def top_level_entries(nm):
    """Installed package directories, one level for plain names, two for scopes."""
    entries = []
    try:
        names = sorted(os.listdir(nm))
    except OSError:
        return entries
    for name in names:
        if name.startswith("."):
            continue
        path = nm / name
        if name.startswith("@") and path.is_dir():
            try:
                for sub in sorted(os.listdir(path)):
                    if not sub.startswith("."):
                        entries.append(f"{name}/{sub}")
            except OSError:
                pass
        elif path.is_dir():
            entries.append(name)
    return entries


def du_sizes(nm, entries):
    """Size in KB per installed package. Verified against `du -sk node_modules`:
    the per-entry sum equals the whole, so these are safe to add up."""
    sizes = {}
    for i in range(0, len(entries), 120):
        chunk = entries[i : i + 120]
        code, out, _ = run(["du", "-sk", *chunk], cwd=nm, timeout=600)
        for line in out.splitlines():
            parts = line.split("\t")
            if len(parts) == 2 and parts[0].strip().isdigit():
                sizes[parts[1].strip()] = int(parts[0].strip())
    return sizes


# --------------------------------------------------------------------------
# dependency graph
# --------------------------------------------------------------------------

def node_key(name, node):
    return f"{name}@{node.get('version', '?')}"


def key_name(key):
    return key.rsplit("@", 1)[0]


def build_graph(tree_root):
    """Flatten `pnpm list --json` / `npm ls --all --json` into name@version -> children.

    Two traps handled here:
      * cycles — a key is expanded at most once;
      * npm's deduped nodes, which appear with no `dependencies` key. Their real
        children are learned from whichever occurrence of the same key does
        carry them, so the graph is not silently truncated.
    """
    graph = {}
    expanded = set()

    def walk(name, node):
        key = node_key(name, node)
        children = node.get("dependencies") or {}
        bucket = graph.setdefault(key, set())
        for child_name, child in children.items():
            bucket.add(node_key(child_name, child))
        if children and key not in expanded:
            expanded.add(key)
            for child_name, child in children.items():
                walk(child_name, child)
        return key

    roots = {}
    for field in ("dependencies", "devDependencies", "optionalDependencies"):
        for name, node in (tree_root.get(field) or {}).items():
            if not isinstance(node, dict):
                continue
            roots[name] = walk(name, node)
    return graph, roots


def reachable(graph, start, cache):
    if start in cache:
        return cache[start]
    seen = set()
    stack = [start]
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        stack.extend(graph.get(cur, ()))
    cache[start] = seen
    return seen


def exclusive_sizes(graph, roots, sizes):
    """own = the package's own directory.
    exclusive = own + every transitive dependency nothing else reaches, i.e. what
    actually frees up if the dependency is dropped."""
    cache = {}
    reach = {name: reachable(graph, key, cache) for name, key in roots.items()}
    result = {}
    for name, key in roots.items():
        others = set()
        for other, other_reach in reach.items():
            if other != name:
                others |= other_reach
        excl = reach[name] - others
        shared_with = sorted(
            other for other, other_reach in reach.items()
            if other != name and key in other_reach
        )
        result[name] = {
            "own_kb": sizes.get(name, 0),
            "exclusive_kb": sum(sizes.get(key_name(k), 0) for k in excl),
            "transitive_count": max(len(reach[name]) - 1, 0),
            "exclusive_count": len(excl),
            # Zero exclusive weight on a large package is not an error: another
            # direct dependency reaches it too, so dropping this one frees
            # nothing. Naming who else reaches it keeps that readable.
            "shared_with": shared_with,
        }
    return result


def load_tree(pkg_path, manager):
    if manager == "pnpm":
        code, out, err = run(
            ["pnpm", "list", "--depth", "Infinity", "--json"], cwd=pkg_path, timeout=600
        )
        data = None
        try:
            data = json.loads(out)
        except Exception:
            return None, f"pnpm list returned unparseable output ({err.strip()[:120]})"
        if isinstance(data, list) and data:
            return data[0], None
        return None, "pnpm list returned an empty project list"
    if manager == "npm":
        # `npm ls` exits non-zero on peer/extraneous complaints while still
        # printing a complete tree. The exit code is not the signal here.
        code, out, err = run(["npm", "ls", "--all", "--json"], cwd=pkg_path, timeout=600)
        try:
            return json.loads(out), None
        except Exception:
            return None, f"npm ls returned unparseable output ({err.strip()[:120]})"
    return None, f"unknown package manager for {pkg_path.name}"


# --------------------------------------------------------------------------
# risk: outdated + audit  (the only two network calls)
# --------------------------------------------------------------------------

def major_of(version):
    if not version:
        return None
    m = re.match(r"\D*(\d+)", str(version))
    return int(m.group(1)) if m else None


def collect_outdated(pkg_path, manager):
    """Both managers exit 1 when they DO find something. Treating that as a
    failure silently empties the whole risk section, so the exit code is
    ignored and only the payload is read."""
    cmd = [manager, "outdated", "--json"]
    code, out, err = run(cmd, cwd=pkg_path, timeout=300)
    if code == 124:
        return [], "outdated timed out"
    try:
        data = json.loads(out) if out.strip() else {}
    except Exception:
        return [], f"{manager} outdated returned unparseable output"
    rows = []
    for name, info in (data or {}).items():
        if not isinstance(info, dict):
            continue
        current = info.get("current")
        latest = info.get("latest")
        cur_major, latest_major = major_of(current), major_of(latest)
        rows.append(
            {
                "name": name,
                "current": current,
                "wanted": info.get("wanted"),
                "latest": latest,
                "majors_behind": (latest_major - cur_major)
                if (cur_major is not None and latest_major is not None)
                else None,
            }
        )
    rows.sort(key=lambda r: (-(r["majors_behind"] or 0), r["name"]))
    return rows, None


def collect_audit(pkg_path, manager):
    code, out, err = run([manager, "audit", "--json"], cwd=pkg_path, timeout=300)
    if code == 124:
        return None, "audit timed out"
    try:
        data = json.loads(out) if out.strip() else {}
    except Exception:
        return None, f"{manager} audit returned unparseable output"
    findings = []
    # npm >= 7 shape
    for name, info in (data.get("vulnerabilities") or {}).items():
        if not isinstance(info, dict):
            continue
        findings.append(
            {
                "name": name,
                "severity": info.get("severity"),
                "direct": bool(info.get("isDirect")),
                "via": [v if isinstance(v, str) else v.get("title") for v in (info.get("via") or [])],
                "fix_available": bool(info.get("fixAvailable")),
            }
        )
    # pnpm shape
    for _id, adv in (data.get("advisories") or {}).items():
        if not isinstance(adv, dict):
            continue
        findings.append(
            {
                "name": adv.get("module_name"),
                "severity": adv.get("severity"),
                "direct": False,
                "via": [adv.get("title")],
                "fix_available": bool(adv.get("patched_versions")),
            }
        )
    order = {"critical": 0, "high": 1, "moderate": 2, "low": 3, "info": 4}
    findings.sort(key=lambda f: (order.get(f.get("severity"), 9), f.get("name") or ""))
    return {"findings": findings, "totals": data.get("metadata", {}).get("vulnerabilities")}, None


# --------------------------------------------------------------------------
# hygiene: unused candidates, duplicates, internal edges
# --------------------------------------------------------------------------

def is_interesting(fname):
    if fname in SCAN_EXCLUDE_NAMES:
        return False
    suffix = Path(fname).suffix
    return (
        suffix in SRC_EXT
        or suffix in {".json", ".yaml", ".yml"}
        or fname.startswith(".")
        or "config" in fname
    )


def scan_files(pkg_path):
    """Files that belong to this repository, preferring git's own answer.

    `git ls-files` rather than a directory walk because server/ carries
    clones/ — a gitignored checkout of an entire other repository that the
    review engine writes into. Walking the filesystem reads that foreign code
    and marks our dependencies "used" on the strength of somebody else's
    imports, which quietly empties the unused section.
    """
    code, out, _ = run(["git", "ls-files", "-z"], cwd=pkg_path, timeout=120)
    if code == 0 and out:
        names = [n for n in out.split("\0") if n]
        return [pkg_path / n for n in names if is_interesting(Path(n).name)]
    files = []
    for root, dirs, entries in os.walk(pkg_path):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        files.extend(Path(root) / f for f in entries if is_interesting(f))
    return files


def scan_text(pkg_path):
    """Concatenated source and config text used for the unused-dependency scan.

    Excluding package.json is load-bearing: it names every dependency, so
    including it would mark all of them used and the section would always be
    empty."""
    chunks = []
    for path in scan_files(pkg_path):
        try:
            chunks.append(path.read_text(errors="ignore"))
        except OSError:
            pass
    return "\n".join(chunks)


def provided_binaries(pkg_path, name):
    """Executable names a dependency installs.

    Needed because scripts call the binary, not the package: mcp's typecheck
    script runs `tsc`, and without this `typescript` is reported as unused.
    """
    meta = read_json(pkg_path / "node_modules" / name / "package.json")
    if not meta:
        return []
    binaries = meta.get("bin")
    if isinstance(binaries, str):
        return [name.split("/")[-1]]
    if isinstance(binaries, dict):
        return list(binaries.keys())
    return []


def unused_candidates(pkg_path, manifest, deps):
    """Heuristic, and labelled as such everywhere downstream.

    A name counts as used when it is imported from source, mentioned in a
    config file, or invoked from a `scripts` entry — that last one is what keeps
    tsx, drizzle-kit and depcruise off the list. `@types/*` are never flagged:
    they are consumed by the compiler, not by an import."""
    text = scan_text(pkg_path)
    scripts = " ".join(str(v) for v in (manifest.get("scripts") or {}).values())
    out = []
    for name in deps:
        if name.startswith("@types/"):
            continue
        quoted = re.compile(r"""['"]%s(/[^'"]*)?['"]""" % re.escape(name))
        if quoted.search(text):
            continue
        invocations = [name, *provided_binaries(pkg_path, name)]
        if any(re.search(r"(?:^|[\s'\"/=])%s(?:$|[\s'\"/@])" % re.escape(cmd), scripts)
               for cmd in invocations):
            continue
        out.append(name)
    return sorted(out)


def tsconfig_links(pkg_path):
    """Cross-package edges are declared as tsconfig `paths`, not as npm
    dependencies — this repository shares code by alias, not by node_modules."""
    cfg = read_json(pkg_path / "tsconfig.json", tolerant=True)
    if not cfg:
        return []
    paths = ((cfg.get("compilerOptions") or {}).get("paths")) or {}
    links = []
    for alias, targets in paths.items():
        for target in targets or []:
            if target.startswith(".."):
                links.append({"alias": alias, "target": target})
    return links


def internal_graph(pkg_path, root):
    r"""Mermaid graph of the package's own src/ modules.

    Three flags, each earned on this repository:
      --exclude   without it the crawler walks into node_modules and the diagram
                  fills with openai's and zod's internals.
      ^[^/]+$     drops single-segment nodes, which are Node builtins and bare
                  package names — noise in a diagram about our own modules.
      --collapse 2  folds src/<area>/** into one node. The regex form
                  '^(\.\./[^/]+/)?src/[^/]+/' is rejected by dependency-cruiser
                  as potentially slow, so the numeric depth is used instead.
    """
    cfg = pkg_path / ".dependency-cruiser.cjs"
    if not cfg.exists():
        return {"available": False, "reason": "no .dependency-cruiser.cjs in this package"}
    binary = None
    for candidate in (pkg_path / "node_modules/.bin/depcruise", root / "server/node_modules/.bin/depcruise"):
        if candidate.exists():
            binary = str(candidate)
            break
    if not binary:
        return {"available": False, "reason": "depcruise binary not installed"}
    code, out, err = run(
        [
            binary, "src",
            "--config", str(cfg),
            "--output-type", "mermaid",
            "--collapse", "2",
            "--do-not-follow", "node_modules",
            "--exclude", "(^|/)node_modules/|^[^/]+$|^(fs|stream|timers|dns|util|readline)/",
        ],
        cwd=pkg_path,
        timeout=300,
    )
    if not out.strip().startswith("flowchart"):
        return {"available": False, "reason": f"depcruise produced no graph ({err.strip()[:120]})"}
    return {"available": True, "mermaid": out.strip(), "reason": None}


# --------------------------------------------------------------------------
# environment
# --------------------------------------------------------------------------

def tool_version(binary, args=("--version",)):
    if not shutil.which(binary):
        return None
    code, out, _ = run([binary, *args], timeout=60)
    return out.strip().splitlines()[0] if out.strip() else None


def npmrc_setting(root, key):
    for candidate in (root / ".npmrc",):
        if candidate.exists():
            for line in candidate.read_text(errors="ignore").splitlines():
                if line.strip().startswith(f"{key}="):
                    return line.split("=", 1)[1].strip()
    return None


def symlink_ratio(nm, entries):
    """The guard on every size in this report.

    `du -sk` only measures real bytes when node_modules holds real directories.
    Under pnpm's default isolated linker those entries are symlinks into a
    global store and du reports the link, not the package — every size would be
    wrong by three orders of magnitude while still looking like a number."""
    if not entries:
        return 0.0
    links = sum(1 for e in entries[:200] if (nm / e).is_symlink())
    return links / len(entries[:200])


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def analyse_package(entry, root, args):
    pkg_path = entry["path"]
    manifest = entry["manifest"]
    manager = detect_manager(pkg_path)
    nm = pkg_path / "node_modules"
    installed = nm.is_dir()

    prod = sorted((manifest.get("dependencies") or {}).keys())
    dev = sorted((manifest.get("devDependencies") or {}).keys())
    peer = sorted((manifest.get("peerDependencies") or {}).keys())

    record = {
        "dir": entry["dir"],
        "name": manifest.get("name"),
        "manager": manager,
        "installed": installed,
        "direct": {"prod": prod, "dev": dev, "peer": peer},
        "direct_counts": {"prod": len(prod), "dev": len(dev), "peer": len(peer)},
        "declared_ranges": {**(manifest.get("dependencies") or {}), **(manifest.get("devDependencies") or {})},
        "tsconfig_links": tsconfig_links(pkg_path),
        "internal_graph": internal_graph(pkg_path, root),
        "notes": [],
    }

    if not installed:
        record["notes"].append(
            "node_modules is not installed — sizes, versions, outdated and audit "
            "are unavailable for this package (not zero, unmeasured)"
        )
        record["node_modules_kb"] = None
        record["packages"] = []
        record["unused_candidates"] = None
        record["outdated"] = None
        record["audit"] = None
        return record

    entries = top_level_entries(nm)
    links = symlink_ratio(nm, entries)
    sizes = du_sizes(nm, entries)
    code, out, _ = run(["du", "-sk", "."], cwd=nm, timeout=600)
    total_kb = int(out.split("\t")[0]) if out.strip() and out.split("\t")[0].isdigit() else None

    record["installed_count"] = len(entries)
    record["node_modules_kb"] = total_kb
    record["sizes_trustworthy"] = links < 0.1
    if links >= 0.1:
        record["notes"].append(
            f"{links:.0%} of node_modules entries are symlinks — du measures the link, "
            "not the package. Every size for this package is unusable; re-run with "
            "node-linker=hoisted or drop the weight section."
        )

    tree, tree_error = load_tree(pkg_path, manager)
    weights = {}
    prod_reach, dev_reach = set(), set()
    if tree:
        graph, roots = build_graph(tree)
        weights = exclusive_sizes(graph, roots, sizes)
        record["installed_versions"] = {n: k.rsplit("@", 1)[1] for n, k in roots.items()}
        # Which branch of the tree a vulnerable package sits under decides its
        # priority: the same CVE in a build tool and in a shipped runtime are
        # not the same finding. Without this the report would be guessing.
        cache = {}
        for name in prod:
            if name in roots:
                prod_reach |= {key_name(k) for k in reachable(graph, roots[name], cache)}
        for name in dev:
            if name in roots:
                dev_reach |= {key_name(k) for k in reachable(graph, roots[name], cache)}
    else:
        record["notes"].append(f"dependency tree unavailable: {tree_error}")
        record["installed_versions"] = {}

    kind = {name: "prod" for name in prod}
    kind.update({name: "dev" for name in dev})
    rows = []
    for name in sorted(set(prod) | set(dev)):
        w = weights.get(name, {})
        trustworthy = record["sizes_trustworthy"]
        rows.append(
            {
                "name": name,
                "type": kind.get(name, "?"),
                "shared_with": w.get("shared_with", []),
                # A zero here would be read as "weighs nothing"; null is read as
                # "not measured", which is what an untrustworthy layout means.
                "own_kb": (w.get("own_kb", sizes.get(name, 0)) if trustworthy else None),
                "exclusive_kb": (w.get("exclusive_kb") if trustworthy else None),
                "transitive_count": w.get("transitive_count"),
                "exclusive_count": w.get("exclusive_count"),
                "version": record["installed_versions"].get(name),
            }
        )
    rows.sort(key=lambda r: (-(r["exclusive_kb"] or r["own_kb"] or 0), r["name"]))
    # Kept untruncated: the cross-package duplicate arithmetic runs over every
    # direct dependency, and --top must bound what the report prints, never what
    # the totals are computed from.
    record["direct_sizes"] = {r["name"]: r["own_kb"] for r in rows if r["own_kb"]}
    record["packages"] = rows[: args.top] if args.top else rows
    record["packages_all_count"] = len(rows)

    record["unused_candidates"] = unused_candidates(pkg_path, manifest, sorted(set(prod) | set(dev)))

    if args.offline:
        record["outdated"] = None
        record["audit"] = None
        record["notes"].append("--offline: outdated and audit were not run")
    else:
        outdated, o_err = collect_outdated(pkg_path, manager)
        record["outdated"] = outdated
        if o_err:
            record["notes"].append(o_err)
        audit, a_err = collect_audit(pkg_path, manager)
        if audit:
            for finding in audit["findings"]:
                name = finding.get("name")
                if name in prod_reach:
                    finding["scope"] = "prod"
                elif name in dev_reach:
                    finding["scope"] = "dev"
                else:
                    finding["scope"] = "unknown"
        record["audit"] = audit
        if a_err:
            record["notes"].append(a_err)
    return record


def main():
    parser = argparse.ArgumentParser(description="Collect dependency facts for the repository.")
    parser.add_argument("--root", default=".", help="repository root (default: cwd)")
    parser.add_argument("--out", default=None, help="write JSON here (default: stdout)")
    parser.add_argument("--offline", action="store_true", help="skip outdated and audit")
    parser.add_argument("--top", type=int, default=25, help="rows kept per package (0 = all)")
    parser.add_argument("--packages", default=None, help="comma-separated package directories")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    discovered = discover_packages(root)
    if not discovered:
        print(f"no packages found under {root}", file=sys.stderr)
        return 2

    selected = discovered
    if args.packages:
        wanted = [p.strip() for p in args.packages.split(",") if p.strip()]
        known = {e["dir"] for e in discovered}
        unknown = [w for w in wanted if w not in known]
        if unknown:
            # Guessing the subject is worse than refusing: analysing everything
            # after a typo produces a report about the wrong thing.
            print(
                f"unknown package(s): {', '.join(unknown)}. Found: {', '.join(sorted(known))}",
                file=sys.stderr,
            )
            return 2
        selected = [e for e in discovered if e["dir"] in wanted]

    result = {
        "generated": date.today().isoformat(),
        "root": str(root),
        "env": {
            "node": tool_version("node", ("-v",)),
            "pnpm": tool_version("pnpm"),
            "npm": tool_version("npm"),
            "node_linker": npmrc_setting(root, "node-linker"),
        },
        "scope": [e["dir"] for e in selected],
        "discovered": [e["dir"] for e in discovered],
        "packages": {},
        "limits": [],
    }

    for entry in selected:
        result["packages"][entry["dir"]] = analyse_package(entry, root, args)

    installed_totals = [
        p["node_modules_kb"] for p in result["packages"].values() if p.get("node_modules_kb")
    ]
    result["totals"] = {
        "packages_analysed": len(selected),
        "node_modules_kb": sum(installed_totals) if installed_totals else None,
        "not_installed": [d for d, p in result["packages"].items() if not p["installed"]],
    }

    versions = {}
    for pkg_dir, pkg in result["packages"].items():
        for name, version in (pkg.get("installed_versions") or {}).items():
            versions.setdefault(name, {}).setdefault(version, []).append(pkg_dir)
    # Disk cost of installing the same dependency in more than one package.
    # This repository is deliberately not a workspace, so a shared dependency is
    # a real second copy on disk — worth a number rather than an adjective.
    own_kb = {}
    for pkg_dir, pkg in result["packages"].items():
        if not pkg.get("sizes_trustworthy"):
            continue
        for name, kb in (pkg.get("direct_sizes") or {}).items():
            own_kb.setdefault(name, {})[pkg_dir] = kb

    result["duplicates"] = [
        {
            "name": name,
            "versions": {v: sorted(dirs) for v, dirs in by_version.items()},
            "same_version": len(by_version) == 1,
            "installed_in": sorted(own_kb.get(name, {})),
            "disk_kb": sum(own_kb.get(name, {}).values()) or None,
            "redundant_kb": (sum(own_kb.get(name, {}).values())
                             - max(own_kb[name].values())) if own_kb.get(name) else None,
        }
        for name, by_version in sorted(versions.items())
        if len(by_version) > 1 or len(own_kb.get(name, {})) > 1
    ]
    result["totals_redundant_kb"] = sum(
        d["redundant_kb"] or 0 for d in result["duplicates"]
    )

    if args.offline:
        result["limits"].append("--offline: no outdated or vulnerability data in this run")
    for pkg_dir, pkg in result["packages"].items():
        for note in pkg["notes"]:
            result["limits"].append(f"{pkg_dir}: {note}")
    result["limits"].append(
        "unused_candidates is a heuristic over imports, config files and scripts — "
        "it is a list to check, not a verdict"
    )
    result["limits"].append(
        "sizes are on-disk node_modules bytes, which include sourcemaps, types and "
        "dual CJS/ESM builds — they are not bundle sizes"
    )

    payload = json.dumps(result, indent=2, sort_keys=False)
    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(payload + "\n")
        print(f"wrote {out_path} ({len(payload)} bytes)")
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    sys.exit(main())
