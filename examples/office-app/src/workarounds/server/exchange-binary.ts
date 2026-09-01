/**
 * Workaround for @univerjs-pro/exchange-node and collaboration-database-sqlite
 * 1.0.0-insiders.20260829-2e3c387.
 *
 * exchange-node 在 Node 中返回 Buffer；JSON.stringify 会先调用 Buffer.toJSON，使 SQLite
 * adapter 的 Uint8Array replacer 无法识别二进制。持久化前临时转成普通 Uint8Array。
 * 当 SDK 在 exchange 输出边界或 SQLite 编码器中统一支持 Buffer 后删除本文件。
 */
export function normalizeExchangeBinaryForSqlite<T>(value: T): T {
  if (Buffer.isBuffer(value)) return Uint8Array.from(value) as T;
  if (Array.isArray(value))
    return value.map((item) => normalizeExchangeBinaryForSqlite(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalizeExchangeBinaryForSqlite(item),
      ]),
    ) as T;
  }
  return value;
}
