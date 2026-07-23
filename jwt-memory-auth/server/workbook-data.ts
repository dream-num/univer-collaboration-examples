import { LocaleType, type IWorkbookData } from "@univerjs/core";

export function createEmptyWorkbookData(
  unitID: string,
  name = "Collaborative Sheet"
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
