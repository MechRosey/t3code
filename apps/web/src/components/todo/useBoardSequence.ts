import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { useRef, useState } from "react";

import { todoBoardSequence } from "../../state/todoBoard";
import { useAtomCommand } from "../../state/use-atom-command";
import { toastManager } from "../ui/toast";
import {
  activeSequence,
  displayedSequence,
  failPendingWrite,
  pendingWritesFor,
  reconcilePendingWrites,
  settlePendingWrite,
  startPendingWrite,
  withPendingWrites,
  type BoardSequenceSource,
  type PendingSequenceWrite,
  type PendingWritesByEpic,
} from "./boardSequence.logic";

export function useBoardSequence(
  environmentId: EnvironmentId,
  cwd: string,
  source: BoardSequenceSource,
  epicFilter: string,
) {
  const sendSequence = useAtomCommand(todoBoardSequence, { reportFailure: false });
  const [writesByEpic, setWritesByEpic] = useState<PendingWritesByEpic>({});
  const lastToken = useRef(0);
  const active = activeSequence(source, epicFilter);
  const { epic } = active;
  const writes = pendingWritesFor(writesByEpic, epic);
  const live = reconcilePendingWrites(writes, active.ids);
  if (live !== writes) setWritesByEpic(withPendingWrites(writesByEpic, epic, live));
  const updateWrites = (
    update: (current: ReadonlyArray<PendingSequenceWrite>) => ReadonlyArray<PendingSequenceWrite>,
  ) =>
    setWritesByEpic((current) =>
      withPendingWrites(current, epic, update(pendingWritesFor(current, epic))),
    );
  const writeSequence = async (ids: ReadonlyArray<string>) => {
    if (!active.writable) return;
    lastToken.current += 1;
    const token = lastToken.current;
    updateWrites((current) => startPendingWrite(current, { token, ids, base: active.ids }));
    const result = await sendSequence({
      environmentId,
      input: { cwd, ids, ...(epic === null ? {} : { epic }) },
    });
    if (result._tag === "Success") {
      updateWrites((current) => settlePendingWrite(current, token, result.value.sequence));
      return;
    }
    updateWrites((current) => failPendingWrite(current, token));
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
  return {
    sequence: displayedSequence(active.ids, live),
    writable: active.writable,
    writeSequence,
  };
}
