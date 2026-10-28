import { Suspense, use } from "react";

type MermaidRenderState =
  | { readonly kind: "rendered"; readonly svg: string }
  | { readonly kind: "failed" };

let mermaidRenderSequence = 0;

let mermaidReady: Promise<(typeof import("mermaid"))["default"]> | null = null;

const renderings = new Map<string, Promise<MermaidRenderState>>();

function loadMermaid() {
  mermaidReady ??= import("mermaid").then((mermaid) => {
    mermaid.default.initialize({ startOnLoad: false, securityLevel: "strict" });
    return mermaid.default;
  });
  return mermaidReady;
}

function renderDiagram(source: string): Promise<MermaidRenderState> {
  let rendering = renderings.get(source);
  if (rendering === undefined) {
    rendering =
      source.trim().length === 0
        ? Promise.resolve({ kind: "failed" })
        : loadMermaid()
            .then((mermaid) => mermaid.render(`board-mermaid-${++mermaidRenderSequence}`, source))
            .then(({ svg }): MermaidRenderState => ({ kind: "rendered", svg }))
            .catch((): MermaidRenderState => ({ kind: "failed" }));
    renderings.set(source, rendering);
  }
  return rendering;
}

export function MermaidView({ source }: { readonly source: string }) {
  return (
    <Suspense fallback={null}>
      <MermaidDiagram source={source} />
    </Suspense>
  );
}

function MermaidDiagram({ source }: { readonly source: string }) {
  const state = use(renderDiagram(source));
  if (state.kind === "failed") {
    return (
      <div className="flex flex-col gap-1">
        <pre className="overflow-x-auto rounded-md bg-foreground/10 p-2 font-mono text-xs text-muted-foreground">
          {source}
        </pre>
        <span className="text-xs text-error">Diagram failed to render</span>
      </div>
    );
  }
  return (
    <div
      className="max-w-full overflow-x-auto rounded-md bg-white p-3 [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}
