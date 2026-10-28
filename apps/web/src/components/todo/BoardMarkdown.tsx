import { memo, type ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { BOARD_MARKDOWN_REHYPE_PLUGINS } from "@t3tools/shared/markdownPipeline";
import type { Content, Root } from "mdast";

import { RenderErrorBoundary } from "../RenderErrorBoundary";
import { splitMermaidFences } from "./boardMarkdown.logic";
import { MermaidView } from "./MermaidView";

function remarkHtmlAsText() {
  return (tree: Root) => {
    const walk = (parent: { children: Content[] }) => {
      parent.children = parent.children.flatMap((child): Content[] => {
        if (child.type === "html") return [{ type: "text", value: child.value }];
        if ("children" in child) walk(child);
        return [child];
      });
    };
    walk(tree);
  };
}

const BOARD_MARKDOWN_REMARK_PLUGINS = [remarkGfm, remarkHtmlAsText];

const BOARD_MARKDOWN_COMPONENTS = {
  h1: (props: ComponentProps<"h1">) => <h1 className="text-base font-semibold" {...props} />,
  h2: (props: ComponentProps<"h2">) => <h2 className="text-sm font-semibold" {...props} />,
  h3: (props: ComponentProps<"h3">) => <h3 className="text-sm font-semibold" {...props} />,
  a: (props: ComponentProps<"a">) => (
    <a className="text-info underline underline-offset-2" {...props} />
  ),
  ul: (props: ComponentProps<"ul">) => <ul className="list-disc ps-5" {...props} />,
  ol: (props: ComponentProps<"ol">) => <ol className="list-decimal ps-5" {...props} />,
  code: (props: ComponentProps<"code">) => (
    <code className="rounded-sm bg-muted/60 px-1 font-mono text-xs" {...props} />
  ),
  pre: (props: ComponentProps<"pre">) => (
    <pre
      className="overflow-x-auto rounded-md bg-foreground/10 p-2 font-mono text-xs [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
  ),
  table: (props: ComponentProps<"table">) => (
    <table className="w-full border-collapse text-xs" {...props} />
  ),
  th: (props: ComponentProps<"th">) => (
    <th className="border border-border/60 px-1.5 py-0.5 text-start font-semibold" {...props} />
  ),
  td: (props: ComponentProps<"td">) => (
    <td className="border border-border/60 px-1.5 py-0.5 align-top" {...props} />
  ),
} satisfies Components;

function keyedSegments(body: string) {
  const ordinals = { markdown: 0, mermaid: 0 };
  return splitMermaidFences(body).map((segment) => ({
    segment,
    key: `${segment.kind}-${ordinals[segment.kind]++}`,
  }));
}

function BoardMarkdownBody({ body }: { readonly body: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm text-foreground/80 [&>*:first-child]:mt-0">
      {keyedSegments(body).map(({ segment, key }) =>
        segment.kind === "markdown" ? (
          <ReactMarkdown
            key={key}
            remarkPlugins={BOARD_MARKDOWN_REMARK_PLUGINS}
            rehypePlugins={BOARD_MARKDOWN_REHYPE_PLUGINS}
            components={BOARD_MARKDOWN_COMPONENTS}
          >
            {segment.text}
          </ReactMarkdown>
        ) : (
          <MermaidView key={key} source={segment.source} />
        ),
      )}
    </div>
  );
}

export const BoardMarkdown = memo(function BoardMarkdown({ body }: { readonly body: string }) {
  return (
    <RenderErrorBoundary fallback={<PlainTextBody body={body} />} resetKeys={[body]}>
      <BoardMarkdownBody body={body} />
    </RenderErrorBoundary>
  );
});

function PlainTextBody({ body }: { readonly body: string }) {
  return <div className="whitespace-pre-wrap text-sm text-foreground/80">{body}</div>;
}
