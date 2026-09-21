import { WS_METHODS, type TodoBoardMutateInput } from "@t3tools/contracts";
import type { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
  type AtomCommandConcurrency,
} from "./runtime.ts";

export function createTodoBoardAtoms<R, E>(runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>) {
  return {
    read: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:todo-board:read",
      tag: WS_METHODS.todoBoardRead,
      staleTimeMs: 30_000,
      idleTtlMs: 5 * 60_000,
    }),
    subscribe: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "environment-data:todo-board:subscribe",
      tag: WS_METHODS.todoBoardSubscribe,
      idleTtlMs: 5 * 60_000,
    }),
    mutate: createEnvironmentRpcCommand(runtime, {
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
    }),
  };
}
