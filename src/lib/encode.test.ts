// Chạy: npm test  (node --experimental-strip-types --test)
// Import có đuôi .ts vì chạy trực tiếp bằng node strip-types.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeData, decodeData } from "./encode.ts";

test("round-trip encode -> decode bằng object gốc", () => {
  const original = {
    domestic: [
      { name: "NHẪN TRÒN 99.99", buy: "13,650,000", sell: "13,950,000", time: "08/06/2026 10:19" },
      { name: "NỮ TRANG 24", buy: "13,450,000", sell: "13,850,000", time: "08/06/2026 10:21" },
    ],
    world: [{ name: "USD/1 Ounce", buy: "1,922.10", sell: "1,923.40", time: "18/10/2023 03:03" }],
    meta: { source: "kimphat", count: 3, nested: { a: 1, b: [true, null, "x"] } },
  };

  const encoded = encodeData(original);
  assert.equal(typeof encoded, "string");

  const decoded = decodeData(encoded);
  assert.deepEqual(decoded, original);
});

test("encode deterministic không phụ thuộc thứ tự key", () => {
  const a = { b: 1, a: 2, nested: { y: 1, x: 2 } };
  const b = { a: 2, b: 1, nested: { x: 2, y: 1 } };
  assert.equal(encodeData(a), encodeData(b));
});
