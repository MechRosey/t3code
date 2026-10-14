export type MermaidFenceSegment =
  | { readonly kind: "markdown"; readonly text: string }
  | { readonly kind: "mermaid"; readonly source: string };

const FENCE_OPEN_REGEX = /^ {0,3}(`{3,})\s*(\S*)/;
const FENCE_CLOSE_REGEX = /^ {0,3}(`{3,})\s*$/;

function joinMermaidSource(lines: ReadonlyArray<string>): string {
  return lines.map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line)).join("\n");
}

function segment(segments: MermaidFenceSegment[], kind: "markdown", text: string): void;
function segment(segments: MermaidFenceSegment[], kind: "mermaid", source: string): void;
function segment(
  segments: MermaidFenceSegment[],
  kind: "markdown" | "mermaid",
  value: string,
): void {
  if (kind === "markdown" && value.length === 0) return;
  segments.push(kind === "markdown" ? { kind, text: value } : { kind, source: value });
}

export function splitMermaidFences(body: string): ReadonlyArray<MermaidFenceSegment> {
  if (body.length === 0) return [];
  const segments: MermaidFenceSegment[] = [];
  const lines = body.split("\n");
  let markdown: string[] = [];
  let fence: {
    readonly openerLength: number;
    readonly mermaid: boolean;
    readonly openLine: string;
    readonly content: string[];
  } | null = null;

  const flushMarkdown = () => {
    segment(segments, "markdown", markdown.join("\n"));
    markdown = [];
  };

  for (const line of lines) {
    if (fence === null) {
      const open = FENCE_OPEN_REGEX.exec(line);
      const openTicks = open?.[1];
      if (openTicks === undefined) {
        markdown.push(line);
        continue;
      }
      const mermaid = (open?.[2] ?? "").toLowerCase() === "mermaid";
      if (mermaid) {
        const last = markdown[markdown.length - 1];
        if (markdown.length > 0 && last !== "") markdown.push("");
        flushMarkdown();
      }
      fence = {
        openerLength: openTicks.length,
        mermaid,
        openLine: line,
        content: [],
      };
      continue;
    }
    const close = FENCE_CLOSE_REGEX.exec(line);
    const closeTicks = close?.[1];
    if (closeTicks !== undefined && closeTicks.length >= fence.openerLength) {
      if (fence.mermaid) {
        flushMarkdown();
        segment(segments, "mermaid", joinMermaidSource(fence.content));
      } else {
        markdown.push(fence.openLine, ...fence.content, line);
      }
      fence = null;
      continue;
    }
    fence.content.push(line);
  }

  if (fence === null) {
    flushMarkdown();
    return segments;
  }
  if (fence.mermaid) {
    flushMarkdown();
    segment(segments, "mermaid", joinMermaidSource(fence.content));
  } else {
    markdown.push(fence.openLine, ...fence.content);
    flushMarkdown();
  }
  return segments;
}
