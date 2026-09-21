import { createTodoBoardAtoms } from "@t3tools/client-runtime/state/todo-board";

import { connectionAtomRuntime } from "../connection/runtime";

export const todoBoard = createTodoBoardAtoms(connectionAtomRuntime);
