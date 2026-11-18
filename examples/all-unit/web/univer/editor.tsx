import { useEffect, useState } from "react";
import type { EditorUser, MountedUniverEditor } from "./types";

interface EditorProps {
  unitId: string;
  unitType: number;
  user: EditorUser;
}

export function Editor({ unitId, unitType, user: { userId, displayName } }: EditorProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let editor: MountedUniverEditor | undefined;
    setLoading(true);
    setError(null);

    async function mount() {
      const { mountUniverEditor } = await import("./mount-editor");
      if (disposed) return;
      const mounted = await mountUniverEditor({
        container: "editor", user: { userId, displayName }, locale: "en-US", unitId, unitType,
      });
      if (disposed) mounted.dispose();
      else {
        editor = mounted;
        setLoading(false);
      }
    }

    void mount().catch((cause: unknown) => {
      if (disposed) return;
      console.error(cause);
      setError(cause instanceof Error ? cause.message : "Unable to open the editor.");
    });
    return () => {
      disposed = true;
      editor?.dispose();
    };
    // Catalog refreshes only change names and timestamps; they must not recreate the editor.
  }, [unitId, unitType, userId, displayName]);

  return (
    <>
      {(loading || error) && <p id="status" role={error ? "alert" : "status"}>{error ?? "Loading editor…"}</p>}
      <div id="editor" />
    </>
  );
}
