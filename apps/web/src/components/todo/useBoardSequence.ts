import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";

import { todoBoardSequence } from "../../state/todoBoard";
import { useAtomCommand } from "../../state/use-atom-command";
import { toastManager } from "../ui/toast";
import { displayedSequence, type PendingSequence } from "./boardSequence.logic";

export function useBoardSequence(
  environmentId: EnvironmentId,
  cwd: string,
  snapshotSequence: ReadonlyArray<string>,
) {
  const sendSequence = useAtomCommand(todoBoardSequence, { reportFailure: false });
  const [pending, setPending] = useState<PendingSequence | null>(null);
  const writeSequence = async (ids: ReadonlyArray<string>) => {
    setPending({ base: snapshotSequence, ids });
    const result = await sendSequence({ environmentId, input: { cwd, ids } });
    if (result._tag !== "Failure") return;
    setPending(null);
    const failure = squashAtomCommandFailure(result);
    toastManager.add({
      type: "error",
      title: "Could not update the sequence",
      description:
        failure instanceof Error && failure.message.length > 0
          ? failure.message
          : "The board rejected the new order.",
    });
  };
  return { sequence: displayedSequence(snapshotSequence, pending), writeSequence };
}
