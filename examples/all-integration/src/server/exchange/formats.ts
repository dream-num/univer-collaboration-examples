import { UniverType } from "@univerjs/protocol";

export const importExtensions = new Map<number, ReadonlySet<string>>([
  [UniverType.UNIVER_SHEET, new Set(["xls", "xlsx", "csv", "tsv"])],
  [UniverType.UNIVER_DOC, new Set(["doc", "docx"])],
  [UniverType.UNIVER_SLIDE, new Set(["ppt", "pptx"])],
  [UniverType.UNIVER_BASE, new Set(["xls", "xlsx", "csv", "tsv"])],
]);

export const exportFormats = new Map<number, ReadonlySet<string>>([
  [UniverType.UNIVER_SHEET, new Set(["xlsx", "csv", "tsv"])],
  [UniverType.UNIVER_DOC, new Set(["docx"])],
  [UniverType.UNIVER_SLIDE, new Set(["pptx"])],
  [UniverType.UNIVER_BASE, new Set(["xlsx", "csv", "tsv"])],
]);

export function contentTypeFor(format: string) {
  if (format === "xlsx")
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (format === "docx")
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (format === "pptx")
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return "text/plain; charset=utf-8";
}

export function decodeMultipartFilename(value: string) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.from(value, "latin1"),
    );
  } catch {
    return value;
  }
}
