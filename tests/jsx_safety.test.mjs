import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const files = [
  "src/features/MerchantApp.tsx",
  "src/features/MainApp.tsx",
  "src/components/UI.tsx",
];
const textContainers = new Set(["Text", "Txt"]);

function source(file) {
  const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

test("React Native containers have no direct text or explicit-space children", () => {
  const failures = [];
  for (const file of files) {
    const tree = source(file);
    function visit(node) {
      if (ts.isJsxElement(node)) {
        const tag = node.openingElement.tagName.getText(tree);
        if (!textContainers.has(tag)) {
          for (const child of node.children) {
            if (ts.isJsxText(child) && child.text.trim()) {
              const { line } = tree.getLineAndCharacterOfPosition(child.getStart(tree));
              failures.push(`${file}:${line + 1} raw ${JSON.stringify(child.text.trim())} in <${tag}>`);
            }
            if (
              ts.isJsxExpression(child) &&
              child.expression &&
              (ts.isStringLiteral(child.expression) ||
                ts.isNoSubstitutionTemplateLiteral(child.expression))
            ) {
              const { line } = tree.getLineAndCharacterOfPosition(child.getStart(tree));
              failures.push(`${file}:${line + 1} string expression in <${tag}>`);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  assert.deepEqual(failures, []);
});

test("falsy string state is coerced before conditional JSX rendering", () => {
  const merchant = readFileSync(
    new URL("../src/features/MerchantApp.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(merchant, /\{(?:pushStatus|merchantNotice)\s*&&/);
  assert.match(merchant, /\{Boolean\(pushStatus\)\s*&&/);
  assert.match(merchant, /\{Boolean\(merchantNotice\)\s*&&/);
});
