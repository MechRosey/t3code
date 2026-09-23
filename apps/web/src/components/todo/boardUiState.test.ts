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
    const state: BoardUiState = {
      tag: "ui",
      sort: "created-asc",
      dropHintDismissed: false,
      view: "columns",
      drawerMode: "normal",
      tagSpec: "",
      query: "",
    };
    writeBoardUiState(storage, ROOT_A, state);
    assert.deepEqual(readBoardUiState(storage, ROOT_A), state);
  });

  it("isolates state per resolved root: one board's filter never leaks into another", () => {
    const storage = memoryStorage();
    writeBoardUiState(storage, ROOT_A, {
      tag: "ui",
      sort: "created-asc",
      dropHintDismissed: true,
      view: "columns",
      drawerMode: "normal",
      tagSpec: "",
      query: "",
    });
    assert.deepEqual(readBoardUiState(storage, ROOT_B), DEFAULT_BOARD_UI_STATE);
    assert.deepEqual(readBoardUiState(storage, ROOT_A), {
      tag: "ui",
      sort: "created-asc",
      dropHintDismissed: true,
      view: "columns",
      drawerMode: "normal",
      tagSpec: "",
      query: "",
    });
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
    writeBoardUiState(storage, "", {
      tag: "ui",
      sort: "created-asc",
      dropHintDismissed: true,
      view: "map",
      drawerMode: "normal",
      tagSpec: "",
      query: "",
    });
    assert.deepEqual(readBoardUiState(storage, ""), DEFAULT_BOARD_UI_STATE);
  });
});

describe("board view toggle persistence", () => {
  it("defaults the view to the column arrangement", () => {
    assert.equal(DEFAULT_BOARD_UI_STATE.view, "columns");
    assert.equal(readBoardUiState(memoryStorage(), ROOT_A).view, "columns");
  });

  it("round-trips a map view choice per resolved root", () => {
    const storage = memoryStorage();
    writeBoardUiState(storage, ROOT_A, {
      tag: null,
      sort: "id-asc",
      dropHintDismissed: false,
      view: "map",
      drawerMode: "normal",
      tagSpec: "",
      query: "",
    });
    assert.equal(readBoardUiState(storage, ROOT_A).view, "map");
    assert.equal(readBoardUiState(storage, ROOT_B).view, "columns");
  });

  it("resets persisted JSON written before the view field existed to columns", () => {
    const legacy = memoryStorage({
      [boardUiStorageKey(ROOT_A)]: JSON.stringify({
        tag: null,
        sort: "id-asc",
        dropHintDismissed: true,
      }),
    });
    assert.deepEqual(readBoardUiState(legacy, ROOT_A), {
      tag: null,
      sort: "id-asc",
      dropHintDismissed: true,
      view: "columns",
      drawerMode: "normal",
      tagSpec: "",
      query: "",
    });
  });

  it("falls back to defaults on an unknown view kind", () => {
    const wrongKind = memoryStorage({
      [boardUiStorageKey(ROOT_A)]: JSON.stringify({
        tag: null,
        sort: "id-asc",
        dropHintDismissed: false,
        view: "diagram",
      }),
    });
    assert.deepEqual(readBoardUiState(wrongKind, ROOT_A), DEFAULT_BOARD_UI_STATE);
  });
});

describe("board drawer mode persistence", () => {
  it("defaults the drawer mode to normal", () => {
    assert.equal(DEFAULT_BOARD_UI_STATE.drawerMode, "normal");
    assert.equal(readBoardUiState(memoryStorage(), ROOT_A).drawerMode, "normal");
  });

  it("round-trips a full drawer mode per resolved root", () => {
    const storage = memoryStorage();
    writeBoardUiState(storage, ROOT_A, {
      tag: null,
      sort: "updated-desc",
      dropHintDismissed: false,
      view: "columns",
      drawerMode: "full",
      tagSpec: "",
      query: "",
    });
    assert.equal(readBoardUiState(storage, ROOT_A).drawerMode, "full");
    assert.equal(readBoardUiState(storage, ROOT_B).drawerMode, "normal");
  });

  it("resets persisted JSON written before the drawer mode field existed to normal", () => {
    const legacy = memoryStorage({
      [boardUiStorageKey(ROOT_A)]: JSON.stringify({ tag: null, sort: "id-asc" }),
    });
    assert.equal(readBoardUiState(legacy, ROOT_A).drawerMode, "normal");
  });

  it("falls back to normal on an unknown drawer mode", () => {
    const wrongKind = memoryStorage({
      [boardUiStorageKey(ROOT_A)]: JSON.stringify({
        tag: null,
        sort: "id-asc",
        dropHintDismissed: false,
        view: "columns",
        drawerMode: "collapsed",
        tagSpec: "",
        query: "",
      }),
    });
    assert.equal(readBoardUiState(wrongKind, ROOT_A).drawerMode, "normal");
  });
});

describe("board filter spec and query persistence", () => {
  it("defaults the tag spec and free-text query to empty", () => {
    assert.equal(DEFAULT_BOARD_UI_STATE.tagSpec, "");
    assert.equal(DEFAULT_BOARD_UI_STATE.query, "");
    assert.equal(readBoardUiState(memoryStorage(), ROOT_A).tagSpec, "");
    assert.equal(readBoardUiState(memoryStorage(), ROOT_A).query, "");
  });

  it("round-trips a tag spec and free-text query per resolved root", () => {
    const storage = memoryStorage();
    writeBoardUiState(storage, ROOT_A, {
      tag: null,
      sort: "updated-desc",
      dropHintDismissed: false,
      view: "columns",
      drawerMode: "normal",
      tagSpec: "ui,board",
      query: "10eb",
    });
    const read = readBoardUiState(storage, ROOT_A);
    assert.equal(read.tagSpec, "ui,board");
    assert.equal(read.query, "10eb");
    assert.equal(readBoardUiState(storage, ROOT_B).tagSpec, "");
  });

  it("resets persisted JSON written before the filter fields existed to empty", () => {
    const legacy = memoryStorage({
      [boardUiStorageKey(ROOT_A)]: JSON.stringify({ tag: null, sort: "id-asc" }),
    });
    const read = readBoardUiState(legacy, ROOT_A);
    assert.equal(read.tagSpec, "");
    assert.equal(read.query, "");
  });

  it("falls back to defaults on a wrong-shaped filter field", () => {
    const wrongShape = memoryStorage({
      [boardUiStorageKey(ROOT_A)]: JSON.stringify({
        tag: null,
        sort: "id-asc",
        tagSpec: 7,
      }),
    });
    assert.deepEqual(readBoardUiState(wrongShape, ROOT_A), DEFAULT_BOARD_UI_STATE);
  });
});

describe("board drop hint persistence", () => {
  it("defaults the drop hint to visible", () => {
    assert.equal(DEFAULT_BOARD_UI_STATE.dropHintDismissed, false);
    assert.deepEqual(readBoardUiState(memoryStorage(), ROOT_A).dropHintDismissed, false);
  });

  it("round-trips a dismissed drop hint per resolved root", () => {
    const storage = memoryStorage();
    writeBoardUiState(storage, ROOT_A, {
      tag: null,
      sort: "updated-desc",
      dropHintDismissed: true,
      view: "columns",
      drawerMode: "normal",
      tagSpec: "",
      query: "",
    });
    assert.equal(readBoardUiState(storage, ROOT_A).dropHintDismissed, true);
    assert.equal(readBoardUiState(storage, ROOT_B).dropHintDismissed, false);
  });

  it("resets the hint to visible for persisted JSON written before the field existed", () => {
    const legacy = memoryStorage({
      [boardUiStorageKey(ROOT_A)]: JSON.stringify({ tag: null, sort: "id-asc" }),
    });
    assert.deepEqual(readBoardUiState(legacy, ROOT_A), {
      tag: null,
      sort: "id-asc",
      dropHintDismissed: false,
      view: "columns",
      drawerMode: "normal",
      tagSpec: "",
      query: "",
    });
  });

  it("falls back to a visible hint on a wrong-shaped dismiss flag", () => {
    const wrongShape = memoryStorage({
      [boardUiStorageKey(ROOT_A)]: JSON.stringify({
        tag: null,
        sort: "id-asc",
        dropHintDismissed: "yes",
      }),
    });
    assert.deepEqual(readBoardUiState(wrongShape, ROOT_A), DEFAULT_BOARD_UI_STATE);
  });
});
