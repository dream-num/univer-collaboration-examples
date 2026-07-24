import { createRequire } from "node:module";
import type { IWorkbookData } from "@univerjs/core";
import {
  DEMO_TRUNK_UNIT_ID,
  DEMO_TRUNK_UNIT_NAME,
} from "../shared/demo.js";

// 服务端 Runtime 使用 SDK 的 CommonJS 入口。这里保持同一入口，避免 tsx
// 同时初始化 @univerjs/core 的 ESM/CJS 构建并重复注册依赖注入 Identifier。
const sdkRequire = createRequire(import.meta.url);
const { LocaleType } = sdkRequire(
  "@univerjs/core"
) as typeof import("@univerjs/core");

export function createDemoTrunkWorkbookData(): IWorkbookData {
  return {
    id: DEMO_TRUNK_UNIT_ID,
    rev: 1,
    name: DEMO_TRUNK_UNIT_NAME,
    appVersion: "",
    locale: LocaleType.ZH_CN,
    sheetOrder: ["sheet-1"],
    sheets: {
      "sheet-1": {
        id: "sheet-1",
        name: "主线",
        rowCount: 100,
        columnCount: 26,
        cellData: {
          0: {
            0: { v: "从左侧创建 Worktree，再在分支中编辑此表格" },
          },
        },
      },
    },
    styles: {},
    resources: [],
  };
}
