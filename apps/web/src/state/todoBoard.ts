import { WS_METHODS, type TodoBoardMutateInput } from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  type AtomCommandConcurrency,
} from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

export const todoBoardRead = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:todo-board:read",
  tag: WS_METHODS.todoBoardRead,
  staleTimeMs: 30_000,
  idleTtlMs: 5 * 60_000,
});

export const todoBoardMutate = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:todo-board:mutate",
  tag: WS_METHODS.todoBoardMutate,
  concurrency: {
    mode: "serial",
    key: ({ environmentId, input }: { environmentId: string; input: TodoBoardMutateInput }) =>
      JSON.stringify([environmentId, input.cwd]),
  } satisfies AtomCommandConcurrency<{
    environmentId: string;
    input: TodoBoardMutateInput;
  }>,
});
