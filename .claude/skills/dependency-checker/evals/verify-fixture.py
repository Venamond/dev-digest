#!/usr/bin/env python3
"""Apply SKILL.md's priority table to a collector JSON and print what qualifies.

Two jobs. It gives each case's ground truth a machine derivation instead of an
authored guess, and it proves the negative case is actually negative: a "clean"
fixture nobody checked rewards the arm that never looked.

Usage: verify-fixture.py <fixture.json>
"""
import json, sys

d = json.load(open(sys.argv[1]))
pkgs = d["packages"]

p0, p1, p2, p3 = [], [], [], []
for name, q in pkgs.items():
    for f in (q.get("audit") or {}).get("findings", []):
        sev, scope = f.get("severity"), f.get("scope")
        if sev in ("critical", "high") and scope == "prod":
            p0.append(f"{name}/{f['name']} {sev} scope=prod")
        elif scope != "prod" or sev in ("moderate", "low"):
            p3.append(f"{name}/{f['name']} {sev} scope={scope}")
    declared = {x["name"]: x for x in (q.get("packages") or [])}
    for o in q.get("outdated") or []:
        if (o.get("majors_behind") or 0) >= 2 and declared.get(o["name"], {}).get("type") == "prod":
            p1.append(f"{name}/{o['name']} {o['majors_behind']} majors behind (prod)")
    if name == "client":
        for x in q.get("packages") or []:
            if x["type"] == "prod" and x["exclusive_kb"] > 1024:
                p1.append(f"client/{x['name']} {x['exclusive_kb']} KB exclusive (prod, >1 MB)")
    for u in q.get("unused_candidates") or []:
        if declared.get(u, {}).get("type") == "prod":
            p2.append(f"{name}/{u} unused candidate declared in prod")
for dup in d.get("duplicates") or []:
    if not dup.get("same_version"):
        p2.append(f"{dup['name']} split across {sorted(dup['versions'])}")

for label, items in (("P0", p0), ("P1", p1), ("P2", p2), ("P3", p3)):
    print(f"{label}: {len(items)}")
    for i in sorted(set(items))[:12]:
        print("   ", i)
print("not_installed:", d["totals"].get("not_installed"))
print("sizes_trustworthy:", {n: q.get("sizes_trustworthy") for n, q in pkgs.items()})
