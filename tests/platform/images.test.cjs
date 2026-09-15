const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");

test("patched native image pipeline decodes and resizes remote-logo formats", async () => {
  const input = { create: { width: 32, height: 16, channels: 4, background: { r: 40, g: 80, b: 120, alpha: 0.5 } } };
  for (const format of ["png", "webp", "avif"]) {
    const source = await sharp(input).toFormat(format).toBuffer();
    const optimized = await sharp(source).resize({ width: 16 }).webp().toBuffer();
    const metadata = await sharp(optimized).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 16);
    assert.equal(metadata.height, 8);
    assert.equal(metadata.hasAlpha, true);
  }
});
