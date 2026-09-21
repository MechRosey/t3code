import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import { useCallback, useState } from "react";

import { isBoardSortOrder, type BoardSortOrder } from "./boardView.logic";

export interface BoardUiState {
  readonly tag: string | null;
  readonly sort: BoardSortOrder;
  readonly dropHintDismissed: boolean;
}

export const DEFAULT_BOARD_UI_STATE: BoardUiState = {
  tag: null,
  sort: "updated-desc",
  dropHintDismissed: false,
};

const BoundedTag = Schema.String.check(Schema.isMaxLength(200));
const BoardUiStateSchema = Schema.Struct({
  tag: Schema.NullOr(BoundedTag),
  sort: Schema.String,
  dropHintDismissed: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
});

const decodeBoardUiState = Schema.decodeUnknownOption(BoardUiStateSchema);

type UiStateStorage = Pick<Storage, "getItem" | "setItem">;

export function boardUiStorageKey(resolvedRoot: string): string {
  return `t3code:board-ui:${resolvedRoot}`;
}

function resolveStorage(storage: UiStateStorage | undefined): UiStateStorage | undefined {
  return storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
}

export function readBoardUiState(
  storage: UiStateStorage | undefined,
  resolvedRoot: string | null,
): BoardUiState {
  if (resolvedRoot === null || resolvedRoot.length === 0) return DEFAULT_BOARD_UI_STATE;
  try {
    const raw = resolveStorage(storage)?.getItem(boardUiStorageKey(resolvedRoot));
    if (!raw) return DEFAULT_BOARD_UI_STATE;
    const decoded = decodeBoardUiState(JSON.parse(raw));
    if (decoded._tag !== "Some") return DEFAULT_BOARD_UI_STATE;
    const { tag, sort, dropHintDismissed } = decoded.value;
    if (!isBoardSortOrder(sort)) return DEFAULT_BOARD_UI_STATE;
    return { tag, sort, dropHintDismissed };
  } catch {
    return DEFAULT_BOARD_UI_STATE;
  }
}

export function writeBoardUiState(
  storage: UiStateStorage | undefined,
  resolvedRoot: string | null,
  state: BoardUiState,
): void {
  if (resolvedRoot === null || resolvedRoot.length === 0) return;
  try {
    resolveStorage(storage)?.setItem(boardUiStorageKey(resolvedRoot), JSON.stringify(state));
  } catch {
    return;
  }
}

export function useBoardUiState(
  resolvedRoot: string | null,
): readonly [BoardUiState, (patch: Partial<BoardUiState>) => void] {
  const storage = typeof window === "undefined" ? undefined : window.localStorage;
  const [entry, setEntry] = useState<{
    readonly root: string | null;
    readonly state: BoardUiState;
  }>(() => ({ root: resolvedRoot, state: readBoardUiState(storage, resolvedRoot) }));
  const current =
    entry.root === resolvedRoot
      ? entry
      : { root: resolvedRoot, state: readBoardUiState(storage, resolvedRoot) };
  const update = useCallback(
    (patch: Partial<BoardUiState>) => {
      setEntry((prev) => {
        const state =
          prev.root === resolvedRoot ? prev.state : readBoardUiState(storage, resolvedRoot);
        const next = { ...state, ...patch };
        writeBoardUiState(storage, resolvedRoot, next);
        return { root: resolvedRoot, state: next };
      });
    },
    [resolvedRoot, storage],
  );
  if (current !== entry) {
    setEntry(current);
  }
  return [current.state, update];
}
