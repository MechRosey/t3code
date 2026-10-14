import { assert, describe, it } from "vite-plus/test";

import { splitMermaidFences } from "./boardMarkdown.logic";

function mermaidSegments(sources: ReadonlyArray<string>): string {
  return sources.map((source) => "```mermaid\n" + source + "\n```").join("\n");
}

describe("splitMermaidFences", () => {
  it("returns one markdown segment when there are no fences", () => {
    const body = "# Ticket\n\nSome prose with **bold** text.";
    assert.deepEqual(splitMermaidFences(body), [{ kind: "markdown", text: body }]);
  });

  it("returns no segments for an empty body", () => {
    assert.deepEqual(splitMermaidFences(""), []);
  });

  it("splits a single mermaid fence into markdown and mermaid segments", () => {
    const body = [
      "before",
      "",
      "```mermaid",
      "flowchart TD",
      "    A --> B",
      "```",
      "",
      "after",
    ].join("\n");
    assert.deepEqual(splitMermaidFences(body), [
      { kind: "markdown", text: "before\n" },
      { kind: "mermaid", source: "flowchart TD\n    A --> B" },
      { kind: "markdown", text: "\nafter" },
    ]);
  });

  it("splits multiple mermaid fences in order", () => {
    const body =
      "a\n" +
      "```mermaid\ngraph TD\n```\n" +
      "b\n" +
      "```mermaid\nsequenceDiagram\nA->>B: hi\n```\n" +
      "c";
    assert.deepEqual(splitMermaidFences(body), [
      { kind: "markdown", text: "a\n" },
      { kind: "mermaid", source: "graph TD" },
      { kind: "markdown", text: "b\n" },
      { kind: "mermaid", source: "sequenceDiagram\nA->>B: hi" },
      { kind: "markdown", text: "c" },
    ]);
  });

  it("matches the fence language case-insensitively", () => {
    const body = "```Mermaid\ngraph TD\n```";
    assert.deepEqual(splitMermaidFences(body), [{ kind: "mermaid", source: "graph TD" }]);
  });

  it("accepts extra info tokens after the fence language", () => {
    const body = "```mermaid title=flow\ngraph TD\n```";
    assert.deepEqual(splitMermaidFences(body), [{ kind: "mermaid", source: "graph TD" }]);
  });

  it("passes non-mermaid code fences through as markdown", () => {
    const source = "const x = 1;";
    const body = "```ts\n" + source + "\n```";
    assert.deepEqual(splitMermaidFences(body), [{ kind: "markdown", text: body }]);
  });

  it("does not treat a fence inside a code fence as a mermaid opener", () => {
    const body = "````md\n```mermaid\ngraph TD\n```\n````";
    assert.deepEqual(splitMermaidFences(body), [{ kind: "markdown", text: body }]);
  });

  it("keeps inline backticks in prose out of fence detection", () => {
    const body = "use `npm run` and ``double ticks``";
    assert.deepEqual(splitMermaidFences(body), [{ kind: "markdown", text: body }]);
  });

  it("treats the rest of an unclosed mermaid fence as its source", () => {
    const body = "intro\n```mermaid\nflowchart LR\nA --> B";
    assert.deepEqual(splitMermaidFences(body), [
      { kind: "markdown", text: "intro\n" },
      { kind: "mermaid", source: "flowchart LR\nA --> B" },
    ]);
  });

  it("treats the rest of an unclosed code fence as markdown", () => {
    const body = "intro\n```ts\nconst x = 1;";
    assert.deepEqual(splitMermaidFences(body), [{ kind: "markdown", text: body }]);
  });

  it("leaves script tags untouched in markdown segments", () => {
    const body = "<script>alert(1)</script>";
    assert.deepEqual(splitMermaidFences(body), [{ kind: "markdown", text: body }]);
  });

  it("leaves script tags inside a mermaid fence in the fence source", () => {
    const body = "```mermaid\n<script>alert(1)</script>\n```";
    assert.deepEqual(splitMermaidFences(body), [
      { kind: "mermaid", source: "<script>alert(1)</script>" },
    ]);
  });

  it("keeps an empty mermaid fence as a mermaid segment", () => {
    const body = "before\n```mermaid\n```\nafter";
    assert.deepEqual(splitMermaidFences(body), [
      { kind: "markdown", text: "before\n" },
      { kind: "mermaid", source: "" },
      { kind: "markdown", text: "after" },
    ]);
  });

  it("keeps a mermaid fence containing only blank lines as a mermaid segment", () => {
    const body = "```mermaid\n\n```";
    assert.deepEqual(splitMermaidFences(body), [{ kind: "mermaid", source: "" }]);
  });

  it("strips carriage returns from mermaid fence content", () => {
    const body = "```mermaid\r\nflowchart TD\r\nA --> B\r\n```";
    assert.deepEqual(splitMermaidFences(body), [
      { kind: "mermaid", source: "flowchart TD\nA --> B" },
    ]);
  });

  it("does not close a long fence with a shorter one", () => {
    const body = "````mermaid\ngraph TD\n```\nmore\n````";
    assert.deepEqual(splitMermaidFences(body), [
      { kind: "mermaid", source: "graph TD\n```\nmore" },
    ]);
  });
});
