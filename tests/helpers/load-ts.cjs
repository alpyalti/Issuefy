const { readFileSync } = require("node:fs");
const { resolve, dirname } = require("node:path");
const { isBuiltin } = require("node:module");
const { Script } = require("node:vm");
const ts = require("typescript");

const root = resolve(__dirname, "../..");

/** Evaluate the real TS module in isolation, with explicit import substitutes.
 * Each load has fresh module state. No application/provider import is loaded
 * implicitly: pass mocks keyed by the exact source import (including @/ aliases).
 * This is transpilation only; npm run typecheck validates application types.
 */
function loadTs(relativePath, mocks = {}) {
  const filename = resolve(root, relativePath);
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const module = { exports: {} };
  function requireMock(id) {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (isBuiltin(id)) return require(id);
    throw new Error(`Unmocked import ${JSON.stringify(id)} in ${relativePath}`);
  }
  const evaluate = new Script(
    `(function(exports, require, module, __filename, __dirname) {\n${outputText}\n})`,
    { filename },
  ).runInThisContext();
  evaluate(module.exports, requireMock, module, filename, dirname(filename));
  return module.exports;
}

module.exports = { loadTs };
