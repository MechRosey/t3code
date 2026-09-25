import { createTodoBoardAtoms } from "@t3tools/client-runtime/state/todo-board";

import { connectionAtomRuntime } from "../connection/runtime";

const todoBoardAtoms = createTodoBoardAtoms(connectionAtomRuntime);

export const todoBoardSubscribe = todoBoardAtoms.subscribe;
export const todoBoardMutate = todoBoardAtoms.mutate;
export const todoBoardRegenerate = todoBoardAtoms.regenerate;
export const todoBoardArchiveRead = todoBoardAtoms.archive;
