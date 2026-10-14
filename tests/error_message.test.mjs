import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(
  new URL("../src/lib/errors.ts", import.meta.url),
  "utf8",
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(code, { module, exports: module.exports, Set, JSON, String });
const { errorMessage } = module.exports;

test("nested Supabase errors never render as [object Object]", () => {
  assert.equal(
    errorMessage({ error: { message: "Invalid order transition" } }),
    "Invalid order transition",
  );
  assert.equal(
    errorMessage('{"error":{"details":"Merchant is not assigned"}}'),
    "Merchant is not assigned",
  );
  assert.equal(errorMessage({ code: "42501" }), "Server error 42501");
  assert.equal(errorMessage({}), "Something went wrong");
  assert.notEqual(errorMessage({ error: {} }), "[object Object]");
});
