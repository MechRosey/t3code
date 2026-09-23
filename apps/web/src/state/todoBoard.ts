import type { EnvironmentId } from "@t3tools/contracts";
import { createTodoBoardAtoms } from "@t3tools/client-runtime/state/todo-board";

import { connectionAtomRuntime } from "../connection/runtime";
import { useEnvironmentQuery } from "./query";

const todoBoardAtoms = createTodoBoardAtoms(connectionAtomRuntime);

export const todoBoardRead = todoBoardAtoms.read;
export const todoBoardSubscribe = todoBoardAtoms.subscribe;
export const todoBoardMutate = todoBoardAtoms.mutate;
export const todoBoardRegenerate = todoBoardAtoms.regenerate;

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
