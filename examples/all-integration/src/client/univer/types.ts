import type { FUniver } from "@univerjs/core/facade";

export interface EditorUser {
  userId: string;
  displayName: string;
}

export type EditorLocale = "zh-CN" | "en-US";

export interface MountUniverEditorOptions {
  container: string;
  user: EditorUser;
  locale: EditorLocale;
  unitType: number;
  unitId: string;
}

export interface MountedUniverEditor {
  readonly univerAPI: FUniver;
  dispose(): void;
  setLocale(locale: EditorLocale): void;
}
