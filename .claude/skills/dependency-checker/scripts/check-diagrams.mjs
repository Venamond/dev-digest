/**
 * Parse every ```mermaid block in a Markdown file with the real mermaid parser.
 *
 * A broken diagram does not fail loudly — it renders as an error box in the
 * middle of the report, which nobody notices until a reader does. This is the
 * gate for that.
 *
 * Usage:  node .claude/skills/dependency-checker/scripts/check-diagrams.mjs <report.md>
 *
 * mermaid and jsdom are resolved from client/node_modules by absolute path, so
 * this runs from the repository root without being installed anywhere.
 */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const fromClient = (rel) => pathToFileURL(join(repoRoot, 'client/node_modules', rel)).href;

const reportPath = process.argv[2];
if (!reportPath) {
  console.error('usage: check-diagrams.mjs <report.md>');
  process.exit(2);
}

let JSDOM;
try {
  ({ JSDOM } = await import(fromClient('jsdom/lib/api.js')));
} catch {
  console.error('jsdom not found in client/node_modules — cannot validate diagrams.');
  console.error('Say so in the report rather than claiming the diagrams were checked.');
  process.exit(3);
}

const dom = new JSDOM('<!DOCTYPE html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.SVGElement = dom.window.SVGElement;
// navigator is a getter-only global in Node 22+, so it needs defineProperty.
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
});

const { default: mermaid } = await import(fromClient('mermaid/dist/mermaid.esm.mjs'));
mermaid.initialize({ startOnLoad: false });

const source = readFileSync(reportPath, 'utf8');
const blocks = [...source.matchAll(/```mermaid\n([\s\S]*?)\n```/g)].map((m) => m[1]);
if (blocks.length === 0) {
  console.log('no mermaid blocks found');
  process.exit(0);
}

let failed = 0;
for (const [i, block] of blocks.entries()) {
  try {
    await mermaid.parse(block);
    console.log(`block ${i + 1}: OK`);
  } catch (error) {
    failed++;
    console.log(`block ${i + 1}: FAIL — ${String(error.message).split('\n')[0].slice(0, 200)}`);
  }
}
console.log(`${blocks.length - failed}/${blocks.length} diagrams parse`);
process.exit(failed ? 1 : 0);
