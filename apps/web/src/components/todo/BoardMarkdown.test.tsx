import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { BoardMarkdown } from "./BoardMarkdown";

describe("BoardMarkdown", () => {
  it("renders headings, lists, and code blocks from a ticket body", () => {
    const body = "# Plan\n\n- first\n- second\n\n```ts\nconst x = 1;\n```";
    const html = renderToStaticMarkup(<BoardMarkdown body={body} />);
    expect(html).toContain("<h1");
    expect(html).toContain("Plan");
    expect(html).toContain("<li>first</li>");
    expect(html).toContain("<li>second</li>");
    expect(html).toContain("<pre");
    expect(html).toContain("const x = 1;");
  });

  it("renders raw HTML as inert text, never as markup", () => {
    const body = '<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">';
    const html = renderToStaticMarkup(<BoardMarkdown body={body} />);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("alert(1)");
  });

  it("renders markdown around a mermaid fence without rendering mermaid during SSR", () => {
    const body = "before\n\n```mermaid\nflowchart TD\n    A --> B\n```\n\nafter";
    const html = renderToStaticMarkup(<BoardMarkdown body={body} />);
    expect(html).toContain("before");
    expect(html).toContain("after");
    expect(html).not.toContain("flowchart");
  });
});
