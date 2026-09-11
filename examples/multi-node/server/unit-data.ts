import { generateRandomId, LocaleType, type IWorkbookData } from "@univerjs/core";

export function createUnitData(unitID: string, name: string): IWorkbookData {
  const sheetID = generateRandomId();
  return {
    id: unitID,
    rev: 1,
    name,
    appVersion: "",
    locale: LocaleType.EN_US,
    sheetOrder: [sheetID],
    sheets: {
      [sheetID]: {
        id: sheetID,
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
