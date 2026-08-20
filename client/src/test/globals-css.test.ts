import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * An invariant about `globals.css`, not about a component.
 *
 * This package styles elements with inline objects (`styles.ts`), and an
 * inline `style={}` attribute outranks every class selector. So a rule here
 * that targets an INTERACTION state — the one thing an inline object cannot
 * express — exists solely as an escape hatch over an inline-styled element,
 * and without `!important` it parses, matches, and changes nothing. That is
 * a silent failure: the CSS looks right and the hover simply never appears.
 *
 * It is recorded in `client/INSIGHTS.md`, was read at the start of the
 * session that then shipped `.dd-fileref:hover` without `!important` anyway,
 * and is therefore promoted here into something that fails instead of being
 * remembered.
 *
 * Structural pseudo-classes (`:first-child`) and the `.dd-md` subtree are
 * deliberately out of scope: that markup comes from rendered Markdown and
 * carries no inline styles, so ordinary specificity applies there.
 */
const INTERACTION_STATE = /:(hover|focus|focus-visible|focus-within|active)\b/;

/**
 * `selector { … }` blocks, one entry per rule; at-rule bodies included.
 *
 * Comments are stripped FIRST. A prose comment in this file mentions a React
 * `style={}` attribute, and those braces split the rule that follows it into
 * fragments the selector match never sees — which is exactly how the second
 * test below caught this parser being silently blind.
 */
function rules(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    out.push({ selector: (m[1] ?? "").trim(), body: m[2] ?? "" });
  }
  return out;
}

describe("globals.css", () => {
  const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");

  it("marks every interaction-state override !important", () => {
    const offenders = rules(css)
      .filter((r) => INTERACTION_STATE.test(r.selector))
      .flatMap((r) =>
        r.body
          .split(";")
          .map((d) => d.trim())
          .filter((d) => d.includes(":") && !d.includes("!important"))
          .map((d) => `${r.selector} { ${d} }`),
      );

    expect(offenders).toEqual([]);
  });

  it("finds the rules it is meant to guard", () => {
    // Without this, deleting every hover rule would make the test above pass
    // vacuously and the guard would quietly stop guarding anything.
    const guarded = rules(css).filter((r) => INTERACTION_STATE.test(r.selector));
    expect(guarded.length).toBeGreaterThan(0);
  });
});
