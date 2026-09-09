import type { FUniver } from "@univerjs/core/facade";
import type { IMember } from "@univerjs/protocol";
import { useEffect, useState } from "react";

export function useCollaborationMembers(
  univerAPI: FUniver | undefined,
  unitID: string | undefined,
) {
  const [members, setMembers] = useState<readonly IMember[]>([]);

  useEffect(() => {
    setMembers([]);
    if (!univerAPI || !unitID) return;

    const subscription = univerAPI.getCollaboration().subscribeCollaborators(
      unitID,
      setMembers,
    );
    return () => subscription.dispose();
  }, [univerAPI, unitID]);

  return members;
}
