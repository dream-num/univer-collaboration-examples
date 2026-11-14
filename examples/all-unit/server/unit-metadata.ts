import type { CollabServiceMiddlewareMap } from "@univerjs-pro/collaboration-service";
import { UniverType, type ISnapshot } from "@univerjs/protocol";

// Exchange passes the file's display details through this call's customData. The application
// explicitly writes those fields into the Unit draft before the SDK persists it.
export const initializeUnitMetadata: CollabServiceMiddlewareMap["createUnit"] = async (context, next) => {
  const marker = context.customData.allUnitCreation;
  const creation = marker && typeof marker === "object" && !Array.isArray(marker)
    ? marker as Record<string, unknown>
    : undefined;
  const metadata = context.unit.metadata;
  metadata.name = nonemptyName(metadata.name) || nonemptyName(creation?.name)
    || snapshotName(context.request.snapshot) || defaultName(context.unit.type);
  const origin = metadata.origin ?? creation?.origin;
  metadata.origin = origin === "seed" || origin === "import" || origin === "attachment" ? origin : "create";
  await next();
};

function nonemptyName(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function snapshotName(snapshot: ISnapshot): string | undefined {
  switch (snapshot.type) {
    case UniverType.UNIVER_SHEET:
    case UniverType.UNIVER_BASE: return nonemptyName(snapshot.workbook?.name);
    case UniverType.UNIVER_DOC: return nonemptyName(snapshot.doc?.name);
    case UniverType.UNIVER_SLIDE: return nonemptyName(snapshot.slide?.name);
    case UniverType.UNIVER_BOARD: return nonemptyName(snapshot.board?.name);
    case UniverType.UNIVER_PDF: return nonemptyName(snapshot.pdf?.name);
    default: return undefined;
  }
}

function defaultName(type: UniverType): string {
  switch (type) {
    case UniverType.UNIVER_SHEET: return "Untitled sheet";
    case UniverType.UNIVER_DOC: return "Untitled document";
    case UniverType.UNIVER_SLIDE: return "Untitled presentation";
    case UniverType.UNIVER_BOARD: return "Untitled board";
    case UniverType.UNIVER_BASE: return "Untitled base";
    case UniverType.UNIVER_PDF: return "Untitled PDF";
    default: return "Untitled unit";
  }
}
