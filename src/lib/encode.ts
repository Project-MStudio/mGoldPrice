// Encode/decode: map <-> string, deterministic (sort keys) so 2 lần cào cùng data
// luôn ra cùng 1 chuỗi -> so khớp ổn định. Lưu DB dưới dạng base64 của canonical JSON.

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

/** Serialize map/JSON -> chuỗi deterministic (key đã sort). */
export function encodeData(obj: Record<string, unknown>): string {
  const canonical = JSON.stringify(sortKeysDeep(obj));
  return Buffer.from(canonical, "utf-8").toString("base64");
}

/** Dịch ngược chuỗi -> đúng JSON object. */
export function decodeData(str: string): Record<string, unknown> {
  const json = Buffer.from(str, "base64").toString("utf-8");
  return JSON.parse(json) as Record<string, unknown>;
}
