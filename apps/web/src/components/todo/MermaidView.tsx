import { useEffect, useState } from "react";

type MermaidRenderState =
  | { readonly kind: "pending" }
  | { readonly kind: "rendered"; readonly svg: string }
  | { readonly kind: "failed" };

let mermaidRenderSequence = 0;

let mermaidReady: Promise<(typeof import("mermaid"))["default"]> | null = null;

function loadMermaid() {
  mermaidReady ??= import("mermaid").then((mermaid) => {
    mermaid.default.initialize({ startOnLoad: false, securityLevel: "strict" });
    return mermaid.default;
  });
  return mermaidReady;
}

export function MermaidView({ source }: { readonly source: string }) {
  const [state, setState] = useState<MermaidRenderState>({ kind: "pending" });
  useEffect(() => {
    let cancelled = false;
    setState({ kind: "pending" });
    void loadMermaid()
      .then((mermaid) => mermaid.render(`board-mermaid-${++mermaidRenderSequence}`, source))
      .then(({ svg }) => {
        if (!cancelled) setState({ kind: "rendered", svg });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [source]);
  if (state.kind === "failed") {
    return (
      <div className="flex flex-col gap-1">
        <pre className="overflow-x-auto rounded-md bg-muted/60 p-2 font-mono text-[.65rem] text-muted-foreground">
          {source}
        </pre>
        <span className="text-[.65rem] text-red-500">Diagram failed to render</span>
      </div>
    );
  }
  if (state.kind === "pending") return null;
  return (
    <div
      className="max-w-full overflow-x-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}
