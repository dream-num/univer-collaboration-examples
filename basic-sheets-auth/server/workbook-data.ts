import { createRequire } from "node:module";
import type { IWorkbookData } from "@univerjs/core";

// 服务端协同 Runtime 使用 SDK 的 CommonJS 入口；这里保持同一入口，避免 tsx
// 同时初始化 @univerjs/core 的 ESM/CJS 构建并重复注册依赖注入 Identifier。
const sdkRequire = createRequire(import.meta.url);
const { LocaleType } = sdkRequire("@univerjs/core") as typeof import("@univerjs/core");

export function createEmptyWorkbookData(
  unitID: string,
  name: string
): IWorkbookData {
  return {
    id: unitID,
    rev: 1,
    name,
    appVersion: "",
    locale: LocaleType.EN_US,
    sheetOrder: ["sheet-1"],
    sheets: {
      "sheet-1": {
        id: "sheet-1",
        name: "Sheet 1",
        rowCount: 100,
        columnCount: 26,
        cellData: {},
      },
    },
    styles: {},
    resources: [],
  };
}
