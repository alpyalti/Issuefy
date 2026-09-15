import { resolve } from "node:path";
import { integrationTests } from "./integration-tests.mjs";

// Consume Node's structured events rather than parsing printable TAP output.
// Any skip/TODO/empty file fails this mandatory CI gate, even if Node exits 0.
export default async function* integrationReporter(source) {
  let finalSummary = false;
  const completedFiles = new Set();
  let invalid = false;
  for await (const { type, data } of source) {
    if (type === "test:pass" || type === "test:fail") {
      yield `${type === "test:pass" ? "PASS" : "FAIL"} ${data.name}\n`;
      if (type === "test:fail" || data.skip || data.todo) invalid = true;
      if (data.details?.error) yield `${data.details.error.stack || data.details.error}\n`;
    }
    if (type === "test:stdout" || type === "test:stderr") yield data.message;
    if (type === "test:summary") {
      if (data.file) completedFiles.add(resolve(data.file));
      const { tests, passed, failed, skipped, todo, cancelled } = data.counts;
      if (!data.success || tests === 0 || passed === 0 || failed || skipped || todo || cancelled) invalid = true;
      if (!data.file) {
        finalSummary = true;
        yield `Integration: ${tests} tests, ${passed} passed, ${failed} failed, ${skipped} skipped, ${todo} todo, ${cancelled} cancelled\n`;
      }
    }
  }
  if (!finalSummary || invalid || integrationTests.some(file => !completedFiles.has(resolve(file)))) {
    process.exitCode = 1;
    yield "Integration gate failed: all selected tests must execute and pass without skips or TODOs.\n";
  }
}
