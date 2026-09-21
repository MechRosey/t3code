export type MermaidFenceSegment =
  | { readonly kind: "markdown"; readonly text: string }
  | { readonly kind: "mermaid"; readonly source: string };

export function splitMermaidFences(body: string): ReadonlyArray<MermaidFenceSegment> {
  throw new Error("not implemented");
}
