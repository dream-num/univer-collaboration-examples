export const unitKinds = [
  { type: 1, key: "doc", glyph: "D", color: "blue" },
  { type: 2, key: "sheet", glyph: "S", color: "green" },
  { type: 3, key: "slide", glyph: "P", color: "orange" },
  { type: 6, key: "board", glyph: "B", color: "violet" },
  { type: 5, key: "base", glyph: "▦", color: "teal" },
] as const;

export const importFormats: Readonly<Record<number, string>> = {
  1: ".doc,.docx",
  2: ".xls,.xlsx,.csv,.tsv",
  3: ".ppt,.pptx",
  5: ".xls,.xlsx,.csv,.tsv",
};

export const exportFormats: Readonly<Record<number, readonly string[]>> = {
  1: ["docx"],
  2: ["xlsx", "csv", "tsv"],
  3: ["pptx"],
  5: ["xlsx", "csv", "tsv"],
};
