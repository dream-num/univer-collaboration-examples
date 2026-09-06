import type { IMember } from "@univerjs/protocol";

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
  onMembersChange: (members: readonly IMember[]) => void;
}

export interface MountedUniverEditor {
  dispose(): void;
  setLocale(locale: EditorLocale): void;
}
