import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { useRef, useState } from "react";

import { todoBoardSequence } from "../../state/todoBoard";
import { useAtomCommand } from "../../state/use-atom-command";
import { toastManager } from "../ui/toast";
import {
  displayedSequence,
  failPendingWrite,
  reconcilePendingWrites,
  settlePendingWrite,
  startPendingWrite,
  type PendingSequenceWrite,
} from "./boardSequence.logic";

export function useBoardSequence(
  environmentId: EnvironmentId,
  cwd: string,
  snapshotSequence: ReadonlyArray<string>,
) {
  const sendSequence = useAtomCommand(todoBoardSequence, { reportFailure: false });
  const [writes, setWrites] = useState<ReadonlyArray<PendingSequenceWrite>>([]);
  const lastToken = useRef(0);
  const live = reconcilePendingWrites(writes, snapshotSequence);
  if (live !== writes) setWrites(live);
  const writeSequence = async (ids: ReadonlyArray<string>) => {
    lastToken.current += 1;
    const token = lastToken.current;
    setWrites((current) => startPendingWrite(current, { token, ids, base: snapshotSequence }));
    const result = await sendSequence({ environmentId, input: { cwd, ids } });
    if (result._tag === "Success") {
      setWrites((current) => settlePendingWrite(current, token, result.value.sequence));
      return;
    }
    setWrites((current) => failPendingWrite(current, token));
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
  return { sequence: displayedSequence(snapshotSequence, live), writeSequence };
}
