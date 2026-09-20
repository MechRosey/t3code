import * as Schema from "effect/Schema";
import { useCallback, useState } from "react";

import { isBoardSortOrder, type BoardSortOrder } from "./boardView.logic";

export interface BoardUiState {
  readonly tag: string | null;
  readonly sort: BoardSortOrder;
}

export const DEFAULT_BOARD_UI_STATE: BoardUiState = { tag: null, sort: "updated-desc" };

const BoundedTag = Schema.String.check(Schema.isMaxLength(200));
const BoardUiStateSchema = Schema.Struct({
  tag: Schema.NullOr(BoundedTag),
  sort: Schema.String,
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
    const { tag, sort } = decoded.value;
    if (!isBoardSortOrder(sort)) return DEFAULT_BOARD_UI_STATE;
    return { tag, sort };
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

const noopUpdate = () => {};

export function useBoardUiState(
  resolvedRoot: string | null,
): readonly [BoardUiState, (patch: Partial<BoardUiState>) => void] {
  const storage = typeof window === "undefined" ? undefined : window.localStorage;
  const [entry, setEntry] = useState<{
    readonly root: string | null;
    readonly state: BoardUiState;
  }>(() => ({ root: resolvedRoot, state: readBoardUiState(storage, resolvedRoot) }));
  if (entry.root !== resolvedRoot) {
    setEntry({ root: resolvedRoot, state: readBoardUiState(storage, resolvedRoot) });
    return [DEFAULT_BOARD_UI_STATE, noopUpdate];
  }
  const update = useCallback(
    (patch: Partial<BoardUiState>) => {
      setEntry((current) => {
        const next = { ...current.state, ...patch };
        writeBoardUiState(storage, resolvedRoot, next);
        return { root: resolvedRoot, state: next };
      });
    },
    [resolvedRoot, storage],
  );
  return [entry.state, update];
}
