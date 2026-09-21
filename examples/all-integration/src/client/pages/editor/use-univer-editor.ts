import { useEffect, useRef, useState } from "react";
import type { AppUnit } from "../../../shared/api-types";
import type {
  EditorLocale,
  EditorUser,
  MountedUniverEditor,
} from "../../univer/types";

export function useUniverEditor({
  unit,
  user,
  locale,
  container,
}: {
  unit: AppUnit | undefined;
  user: EditorUser;
  locale: EditorLocale;
  container: string;
}) {
  const [editor, setEditor] = useState<MountedUniverEditor>();
  const [error, setError] = useState(false);
  const localeRef = useRef(locale);
  const unitId = unit?.unitId;
  const unitType = unit?.type;
  const { userId, displayName } = user;

  useEffect(() => {
    localeRef.current = locale;
    editor?.setLocale(locale);
  }, [editor, locale]);

  useEffect(() => {
    setEditor(undefined);
    setError(false);
    if (!unitId || unitType === undefined) return;

    let mounted: MountedUniverEditor | undefined;
    let cancelled = false;

    import("../../univer/mount-editor")
      .then(async ({ mountUniverEditor }) => {
        if (cancelled) return;
        const instance = await mountUniverEditor({
          container,
          user: { userId, displayName },
          locale: localeRef.current,
          unitType,
          unitId,
        });

        // The page may unmount or switch documents before initialization completes.
        if (cancelled) {
          instance.dispose();
        } else {
          mounted = instance;
          setEditor(instance);
        }
      })
      .catch((mountError) => {
        if (cancelled) return;
        console.error(mountError);
        setError(true);
      });

    return () => {
      cancelled = true;
      mounted?.dispose();
    };
  }, [container, unitId, unitType, userId, displayName]);

  return { editor, error };
}
