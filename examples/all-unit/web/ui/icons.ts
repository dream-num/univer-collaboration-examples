import { UniverType } from "@univerjs/protocol";

const shapes = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  brand: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12"/>',
  people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  sheet: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 12h8M8 16h8"/>',
  slide: '<rect x="3" y="3" width="18" height="14" rx="2"/><path d="M12 17v5m-5 0 5-5 5 5M8 8h8M8 12h5"/>',
  board: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="12" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 19h7"/>',
  base: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>',
  pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 16h8"/>',
} as const;

export function icon(name: keyof typeof shapes): SVGSVGElement {
  const element = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  element.setAttribute("viewBox", "0 0 24 24");
  element.setAttribute("fill", "none");
  element.setAttribute("stroke", "currentColor");
  element.setAttribute("stroke-width", "1.7");
  element.setAttribute("stroke-linecap", "round");
  element.setAttribute("stroke-linejoin", "round");
  element.setAttribute("aria-hidden", "true");
  element.classList.add("au-icon");
  element.innerHTML = shapes[name];
  return element;
}

export function unitIcon(type: UniverType): HTMLSpanElement {
  const names: Partial<Record<UniverType, "sheet" | "doc" | "slide" | "board" | "base" | "pdf">> = {
    [UniverType.UNIVER_SHEET]: "sheet",
    [UniverType.UNIVER_DOC]: "doc",
    [UniverType.UNIVER_SLIDE]: "slide",
    [UniverType.UNIVER_BOARD]: "board",
    [UniverType.UNIVER_BASE]: "base",
    [UniverType.UNIVER_PDF]: "pdf",
  };
  const name = names[type] ?? "doc";
  const element = document.createElement("span");
  element.className = `au-unit-icon au-unit-icon-${name}`;
  element.append(icon(name));
  return element;
}
