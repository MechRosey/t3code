import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  TodoArchiveReadInput,
  TodoArchiveReadResult,
  TodoBoardMutateInput,
  TodoBoardRegenerateInput,
  TodoBoardRegenerateResult,
  TodoIssue,
} from "./todoBoard.ts";

const decodeMutate = Schema.decodeUnknownSync(TodoBoardMutateInput);
const decodeIssue = Schema.decodeUnknownSync(TodoIssue);
const decodeRegenerate = Schema.decodeUnknownSync(TodoBoardRegenerateInput);
const decodeRegenerateResult = Schema.decodeUnknownSync(TodoBoardRegenerateResult);
const decodeArchiveRead = Schema.decodeUnknownSync(TodoArchiveReadInput);
const decodeArchiveReadResult = Schema.decodeUnknownSync(TodoArchiveReadResult);

describe("TodoBoardMutateInput", () => {
  it("accepts every consumed verb as a discriminated member", () => {
    const cwd = { cwd: "C:\\proj" };
    expect(
      decodeMutate({ ...cwd, action: "status", id: "abc12-x", status: "doing" }),
    ).toMatchObject({
      action: "status",
    });
    expect(
      decodeMutate({ ...cwd, action: "comment", id: "abc12-x", text: "note", by: "tester" }),
    ).toMatchObject({ action: "comment" });
    expect(decodeMutate({ ...cwd, action: "tag", id: "abc12-x", tag: "beta" })).toMatchObject({
      action: "tag",
    });
    expect(
      decodeMutate({
        ...cwd,
        action: "link",
        id: "abc12-x",
        type: "blocks",
        target: "def13-y",
        remove: true,
      }),
    ).toMatchObject({ action: "link" });
    expect(
      decodeMutate({ ...cwd, action: "rollup", id: "abc12-x", status: "done", text: "done well" }),
    ).toMatchObject({ action: "rollup" });
    expect(decodeMutate({ ...cwd, action: "archive", id: "abc12-x" })).toMatchObject({
      action: "archive",
    });
  });

  it("rejects unknown verbs and link types", () => {
    expect(() =>
      decodeMutate({ cwd: "C:\\proj", action: "retitle", id: "abc12-x", title: "T" }),
    ).toThrow();
    expect(() =>
      decodeMutate({
        cwd: "C:\\proj",
        action: "link",
        id: "abc12-x",
        type: "mentions",
        target: "def13-y",
      }),
    ).toThrow();
  });
});

describe("TodoArchiveReadInput", () => {
  it("accepts a cwd and rejects a missing or empty one", () => {
    expect(decodeArchiveRead({ cwd: "C:\\proj" })).toEqual({ cwd: "C:\\proj" });
    expect(() => decodeArchiveRead({})).toThrow();
    expect(() => decodeArchiveRead({ cwd: "" })).toThrow();
  });
});

describe("TodoArchiveReadResult", () => {
  const issue = {
    id: "e0ae5-archive-target",
    title: "Archive target",
    status: "done",
    created: "2026-09-20 12:00",
    updated: "2026-09-20 12:00",
    tags: [],
    epic: null,
    parentId: null,
    depth: 0,
    rootHue: 270,
    markerPath: "C:/board/.todo/archive/e0ae5-archive-target/e0ae5-archive-target.md",
    archived: true,
    sections: {
      brief: { content: false, text: "" },
      reading: { content: false, marker: false },
      doing: { content: false, marker: false },
      log: { content: false },
      openQuestions: { content: false, hasOpen: false, hasHumanOpen: false },
    },
    body: "",
    links: { blocks: [], relates: [] },
  };

  it("decodes archive groups keyed by directory name with a nullable root issue", () => {
    const result = decodeArchiveReadResult({
      boardRoot: "C:/board/.todo",
      repoName: "board",
      groups: [
        {
          dirName: "e0ae5-archive-target",
          rootIssue: issue,
          snapshot: { root: "C:/board/.todo", repoName: "board", issues: [issue] },
        },
        {
          dirName: "e0ae5-archive-target-2",
          rootIssue: null,
          snapshot: { root: "C:/board/.todo", repoName: "board", issues: [] },
        },
      ],
    });
    expect(result.groups.map((group) => group.dirName)).toEqual([
      "e0ae5-archive-target",
      "e0ae5-archive-target-2",
    ]);
    expect(result.groups[0]?.rootIssue?.archived).toBe(true);
    expect(result.groups[1]?.rootIssue).toBeNull();
  });

  it("rejects a group without a directory name, snapshot, or a non-issue root", () => {
    const base = {
      boardRoot: "C:/board/.todo",
      repoName: "board",
      groups: [
        { dirName: "g", rootIssue: null, snapshot: { root: "r", repoName: "b", issues: [] } },
      ],
    };
    expect(() =>
      decodeArchiveReadResult({
        ...base,
        groups: [{ rootIssue: null, snapshot: base.groups[0]?.snapshot }],
      }),
    ).toThrow();
    expect(() =>
      decodeArchiveReadResult({ ...base, groups: [{ dirName: "g", rootIssue: null }] }),
    ).toThrow();
    expect(() =>
      decodeArchiveReadResult({
        ...base,
        groups: [{ dirName: "g", rootIssue: { id: 7 }, snapshot: base.groups[0]?.snapshot }],
      }),
    ).toThrow();
  });
});

describe("TodoBoardRegenerateInput", () => {
  it("accepts the board and index targets", () => {
    expect(decodeRegenerate({ cwd: "C:\\proj", target: "board" })).toEqual({
      cwd: "C:\\proj",
      target: "board",
    });
    expect(decodeRegenerate({ cwd: "C:\\proj", target: "index" })).toEqual({
      cwd: "C:\\proj",
      target: "index",
    });
  });

  it("rejects unknown targets, missing cwd, and empty cwd", () => {
    expect(() => decodeRegenerate({ cwd: "C:\\proj", target: "both" })).toThrow();
    expect(() => decodeRegenerate({ target: "board" })).toThrow();
    expect(() => decodeRegenerate({ cwd: "", target: "board" })).toThrow();
  });
});

describe("TodoBoardRegenerateResult", () => {
  it("decodes the artifact filenames written", () => {
    expect(decodeRegenerateResult({ artifacts: ["INDEX.md", "board.html"] })).toEqual({
      artifacts: ["INDEX.md", "board.html"],
    });
  });

  it("rejects non-string artifacts", () => {
    expect(() => decodeRegenerateResult({ artifacts: [1] })).toThrow();
  });
});

describe("TodoIssue", () => {
  it("decodes the skill's export shape field-for-field", () => {
    const issue = decodeIssue({
      id: "abc12-alpha",
      title: "Alpha",
      status: "doing",
      created: "2026-09-20 12:00",
      updated: "2026-09-20 12:00",
      tags: ["one"],
      epic: null,
      parentId: null,
      depth: 0,
      rootHue: 60,
      markerPath: "C:/board/abc12-alpha/abc12-alpha.md",
      archived: false,
      sections: {
        brief: { content: true, text: "text" },
        reading: { content: false, marker: false },
        doing: { content: false, marker: true },
        log: { content: true },
        openQuestions: { content: false, hasOpen: false, hasHumanOpen: false },
      },
      body: "body",
      links: { blocks: [], relates: [] },
    });
    expect(issue.rootHue).toBe(60);
    expect(issue.sections.doing.marker).toBe(true);
  });

  it("carries an unknown status through untouched like the skill's export", () => {
    const issue = decodeIssue({
      id: "abc12-alpha",
      title: "Alpha",
      status: "sideways",
      created: "",
      updated: "",
      tags: [],
      epic: null,
      parentId: null,
      depth: 0,
      rootHue: null,
      markerPath: "x",
      archived: false,
      sections: {
        brief: { content: false, text: "" },
        reading: { content: false, marker: false },
        doing: { content: false, marker: false },
        log: { content: false },
        openQuestions: { content: false, hasOpen: false, hasHumanOpen: false },
      },
      body: "",
      links: { blocks: [], relates: [] },
    });
    expect(issue.status).toBe("sideways");
  });
});
