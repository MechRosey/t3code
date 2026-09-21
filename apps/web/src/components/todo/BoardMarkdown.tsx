import { memo, useMemo, type ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
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

const BOARD_MARKDOWN_REHYPE_PLUGINS = [rehypeSanitize];

const BOARD_MARKDOWN_COMPONENTS = {
  h1: (props: ComponentProps<"h1">) => <h1 className="text-sm font-semibold" {...props} />,
  h2: (props: ComponentProps<"h2">) => <h2 className="text-xs font-semibold" {...props} />,
  h3: (props: ComponentProps<"h3">) => <h3 className="text-xs font-semibold" {...props} />,
  a: (props: ComponentProps<"a">) => (
    <a className="text-blue-500 underline underline-offset-2" {...props} />
  ),
  ul: (props: ComponentProps<"ul">) => <ul className="list-disc ps-5" {...props} />,
  ol: (props: ComponentProps<"ol">) => <ol className="list-decimal ps-5" {...props} />,
  code: (props: ComponentProps<"code">) => (
    <code className="rounded-sm bg-muted/60 px-1 font-mono text-[.65rem]" {...props} />
  ),
  pre: (props: ComponentProps<"pre">) => (
    <pre
      className="overflow-x-auto rounded-md bg-muted/60 p-2 font-mono text-[.65rem] [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
  ),
  table: (props: ComponentProps<"table">) => (
    <table className="w-full border-collapse text-[.65rem]" {...props} />
  ),
  th: (props: ComponentProps<"th">) => (
    <th className="border border-border/60 px-1.5 py-0.5 text-start font-semibold" {...props} />
  ),
  td: (props: ComponentProps<"td">) => (
    <td className="border border-border/60 px-1.5 py-0.5 align-top" {...props} />
  ),
} satisfies Components;

function BoardMarkdownBody({ body }: { readonly body: string }) {
  const segments = useMemo(() => splitMermaidFences(body), [body]);
  return (
    <div className="flex flex-col gap-2 text-xs text-foreground/80 [&>*:first-child]:mt-0">
      {segments.map((segment, index) =>
        segment.kind === "markdown" ? (
          <ReactMarkdown
            key={index}
            remarkPlugins={BOARD_MARKDOWN_REMARK_PLUGINS}
            rehypePlugins={BOARD_MARKDOWN_REHYPE_PLUGINS}
            components={BOARD_MARKDOWN_COMPONENTS}
          >
            {segment.text}
          </ReactMarkdown>
        ) : (
          <MermaidView key={index} source={segment.source} />
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
  return <div className="whitespace-pre-wrap text-xs text-foreground/80">{body}</div>;
}
