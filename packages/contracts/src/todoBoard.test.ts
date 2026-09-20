import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { TodoBoardMutateInput, TodoIssue } from "./todoBoard.ts";

const decodeMutate = Schema.decodeUnknownSync(TodoBoardMutateInput);
const decodeIssue = Schema.decodeUnknownSync(TodoIssue);

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

  it("rejects a status outside the board vocabulary", () => {
    expect(() =>
      decodeIssue({
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
      }),
    ).toThrow();
  });
});
