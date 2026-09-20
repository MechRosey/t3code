import { assert, describe, it } from "vite-plus/test";

import {
  boardUiStorageKey,
  DEFAULT_BOARD_UI_STATE,
  readBoardUiState,
  writeBoardUiState,
  type BoardUiState,
} from "./boardUiState";

function memoryStorage(entries: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

const ROOT_A = "C:/repo-a/.todo";
const ROOT_B = "C:/repo-b/.todo";

describe("board UI state storage key", () => {
  it("embeds the resolved board root so two boards never collide", () => {
    assert.equal(boardUiStorageKey(ROOT_A), `t3code:board-ui:${ROOT_A}`);
    assert.notEqual(boardUiStorageKey(ROOT_A), boardUiStorageKey(ROOT_B));
  });
});

describe("board UI state persistence", () => {
  it("round-trips filter and sort state per resolved root", () => {
    const storage = memoryStorage();
    const state: BoardUiState = { tag: "ui", sort: "created-asc" };
    writeBoardUiState(storage, ROOT_A, state);
    assert.deepEqual(readBoardUiState(storage, ROOT_A), state);
  });

  it("isolates state per resolved root: one board's filter never leaks into another", () => {
    const storage = memoryStorage();
    writeBoardUiState(storage, ROOT_A, { tag: "ui", sort: "created-asc" });
    assert.deepEqual(readBoardUiState(storage, ROOT_B), DEFAULT_BOARD_UI_STATE);
    assert.deepEqual(readBoardUiState(storage, ROOT_A), { tag: "ui", sort: "created-asc" });
  });

  it("falls back to defaults when nothing is stored", () => {
    assert.deepEqual(readBoardUiState(memoryStorage(), ROOT_A), DEFAULT_BOARD_UI_STATE);
    assert.deepEqual(readBoardUiState(undefined, ROOT_A), DEFAULT_BOARD_UI_STATE);
  });

  it("falls back to defaults on corrupt JSON or a wrong-shaped payload", () => {
    const corrupt = memoryStorage({ [boardUiStorageKey(ROOT_A)]: "{not json" });
    assert.deepEqual(readBoardUiState(corrupt, ROOT_A), DEFAULT_BOARD_UI_STATE);
    const wrongShape = memoryStorage({
      [boardUiStorageKey(ROOT_A)]: JSON.stringify({ tag: 7, sort: "sideways" }),
    });
    assert.deepEqual(readBoardUiState(wrongShape, ROOT_A), DEFAULT_BOARD_UI_STATE);
    const unknownSort = memoryStorage({
      [boardUiStorageKey(ROOT_A)]: JSON.stringify({ tag: null, sort: "sideways" }),
    });
    assert.deepEqual(readBoardUiState(unknownSort, ROOT_A), DEFAULT_BOARD_UI_STATE);
  });

  it("treats an empty resolved root as no state rather than a shared bucket", () => {
    const storage = memoryStorage();
    writeBoardUiState(storage, "", { tag: "ui", sort: "created-asc" });
    assert.deepEqual(readBoardUiState(storage, ""), DEFAULT_BOARD_UI_STATE);
  });
});
