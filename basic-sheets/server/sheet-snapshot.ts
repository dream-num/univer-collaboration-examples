import { createRequire } from "node:module";
import type { IWorkbookData } from "@univerjs/core";
import type { CreateUnitInput } from "@univerjs/collaboration-service";
import type { ISaveSheetBlockRequest, ISheetBlock } from "@univerjs/protocol";

const sdkRequire = createRequire(import.meta.url);
const { LocaleType } = sdkRequire("@univerjs/core") as typeof import("@univerjs/core");
const { ErrorCode } = sdkRequire("@univerjs/protocol") as typeof import("@univerjs/protocol");
const { transformWorkbookDataToSnapshot } = sdkRequire(
  "@univerjs-pro/collaboration"
) as typeof import("@univerjs-pro/collaboration");

export async function createEmptyWorkbook(
  unitID: string,
  name: string
): Promise<CreateUnitInput> {
  const workbook: IWorkbookData = {
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
  const sheetBlocks: ISheetBlock[] = [];
  const ok = { code: ErrorCode.OK, message: "" };
  const capture = {
    saveSheetBlock: async (
      _context: unknown,
      request: ISaveSheetBlockRequest
    ) => {
      if (!request.block) throw new Error("Snapshot contains an empty block");
      sheetBlocks.push(request.block);
      return { error: ok, blockID: request.block.id };
    },
    saveSnapshot: async () => ({ error: ok }),
  };
  const { snapshot } = await transformWorkbookDataToSnapshot(
    {},
    workbook,
    unitID,
    1,
    capture as never
  );
  return { snapshot, sheetBlocks };
}
