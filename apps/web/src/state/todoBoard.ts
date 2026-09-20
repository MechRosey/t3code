import { WS_METHODS, type EnvironmentId, type TodoBoardMutateInput } from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
  type AtomCommandConcurrency,
} from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";
import { useEnvironmentQuery } from "./query";

export const todoBoardRead = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:todo-board:read",
  tag: WS_METHODS.todoBoardRead,
  staleTimeMs: 30_000,
  idleTtlMs: 5 * 60_000,
});

export const todoBoardSubscribe = createEnvironmentRpcSubscriptionAtomFamily(
  connectionAtomRuntime,
  {
    label: "environment-data:todo-board:subscribe",
    tag: WS_METHODS.todoBoardSubscribe,
    idleTtlMs: 5 * 60_000,
  },
);

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

export function useTodoBoardAvailability(
  environmentId: EnvironmentId | null,
  cwd: string | null,
): boolean | null {
  const query = useEnvironmentQuery(
    environmentId === null || cwd === null || cwd.length === 0
      ? null
      : todoBoardRead({ environmentId, input: { cwd } }),
  );
  if (query.error !== null) return false;
  if (query.data !== null) return true;
  return null;
}
