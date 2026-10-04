import type { KeyboardEvent } from "react";

import { shortBoardId } from "./boardCopy.logic";
import {
  mapTitleLines,
  type FocusAnchor,
  type FocusEdgeViewModel,
  type FocusGraph,
  type FocusNodeViewModel,
} from "./mapView.logic";

const TITLE_MAX_CHARS = 17;
const NODE_CORNER_RADIUS = 8;
const FOCUS_RING_GAP = 3;
const VIEW_MARGIN = 5;
const FLAGGED_STROKE_WIDTH = 2;
const DEFAULT_STROKE_WIDTH = 1;
const CURVE_REACH = 0.5;
const BLOCKED_DASH = "4 3";
const TEXT_INSET_X = 8;
const TITLE_FIRST_LINE_Y = 19;
const TITLE_SECOND_LINE_Y = 30;
const FOOTER_Y = 41;
const BADGE_RADIUS = 6;
const BADGE_INSET = 8;
const BADGE_GLYPH_DROP = 2.5;

const FILL_BY_STATUS: Record<string, string> = {
  backlog: "fill-card",
  read: "fill-info/15",
  doing: "fill-primary/15",
  blocked: "fill-error/15",
  done: "fill-success/15",
  cancelled: "fill-muted",
};

const STROKE_BY_STATUS: Record<string, string> = {
  backlog: "stroke-muted-foreground/40",
  read: "stroke-info/50",
  doing: "stroke-primary/50",
  blocked: "stroke-error/50",
  done: "stroke-success/50",
  cancelled: "stroke-muted-foreground/30",
};

const FALLBACK_FILL = "fill-card";
const FALLBACK_STROKE = "stroke-muted-foreground/40";

interface Point {
  readonly x: number;
  readonly y: number;
}

const ANCHOR_NORMALS: Record<FocusAnchor, Point> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

interface MapViewProps {
  readonly graph: FocusGraph;
  readonly onFocusIssue: (issueId: string) => void;
}

function anchorPoint(node: FocusNodeViewModel, anchor: FocusAnchor) {
  const centreX = node.x + node.width / 2;
  const centreY = node.y + node.height / 2;
  switch (anchor) {
    case "top":
      return { x: centreX, y: node.y };
    case "bottom":
      return { x: centreX, y: node.y + node.height };
    case "left":
      return { x: node.x, y: centreY };
    case "right":
      return { x: node.x + node.width, y: centreY };
  }
}

function anchorReach(start: Point, end: Point, normal: Point): number {
  const span = normal.x === 0 ? Math.abs(end.y - start.y) : Math.abs(end.x - start.x);
  return span * CURVE_REACH;
}

function edgePath(from: FocusNodeViewModel, to: FocusNodeViewModel, edge: FocusEdgeViewModel) {
  const start = anchorPoint(from, edge.fromAnchor);
  const end = anchorPoint(to, edge.toAnchor);
  const startNormal = ANCHOR_NORMALS[edge.fromAnchor];
  const endNormal = ANCHOR_NORMALS[edge.toAnchor];
  const startReach = anchorReach(start, end, startNormal);
  const endReach = anchorReach(start, end, endNormal);
  const startControl = `${start.x + startNormal.x * startReach} ${start.y + startNormal.y * startReach}`;
  const endControl = `${end.x + endNormal.x * endReach} ${end.y + endNormal.y * endReach}`;
  return `M ${start.x} ${start.y} C ${startControl}, ${endControl}, ${end.x} ${end.y}`;
}

function MapEdge({ edge, path }: { readonly edge: FocusEdgeViewModel; readonly path: string }) {
  if (edge.kind === "blocks") {
    return (
      <path
        d={path}
        className="stroke-error/80"
        strokeWidth={1.5}
        strokeDasharray="6 4"
        fill="none"
        markerEnd="url(#bc-map-cross)"
      />
    );
  }
  if (edge.kind === "relates") {
    return (
      <path
        d={path}
        className="stroke-muted-foreground/60"
        strokeWidth={1.5}
        strokeDasharray="2 4"
        fill="none"
        markerEnd="url(#bc-map-arrow-muted)"
      />
    );
  }
  return (
    <path
      d={path}
      className="stroke-muted-foreground/50"
      strokeWidth={1.5}
      fill="none"
      markerEnd="url(#bc-map-arrow-muted)"
    />
  );
}

function nodeStrokeClass(node: FocusNodeViewModel): string {
  if (node.flagged) return "stroke-warning";
  return STROKE_BY_STATUS[node.status] ?? FALLBACK_STROKE;
}

function MapNodeFace({ node }: { readonly node: FocusNodeViewModel }) {
  const titleLines = mapTitleLines(node.title, TITLE_MAX_CHARS);
  return (
    <>
      <rect
        width={node.width}
        height={node.height}
        rx={NODE_CORNER_RADIUS}
        className="fill-background"
      />
      <rect
        width={node.width}
        height={node.height}
        rx={NODE_CORNER_RADIUS}
        strokeWidth={node.flagged ? FLAGGED_STROKE_WIDTH : DEFAULT_STROKE_WIDTH}
        strokeDasharray={node.status === "blocked" ? BLOCKED_DASH : undefined}
        className={`${FILL_BY_STATUS[node.status] ?? FALLBACK_FILL} ${nodeStrokeClass(node)}`}
      />
      {node.isFocus ? (
        <rect
          x={-FOCUS_RING_GAP}
          y={-FOCUS_RING_GAP}
          width={node.width + FOCUS_RING_GAP * 2}
          height={node.height + FOCUS_RING_GAP * 2}
          rx={NODE_CORNER_RADIUS + FOCUS_RING_GAP}
          strokeWidth={FLAGGED_STROKE_WIDTH}
          fill="none"
          className="stroke-foreground"
        />
      ) : null}
      <text
        x={TEXT_INSET_X}
        y={TITLE_FIRST_LINE_Y}
        className="fill-foreground text-3xs font-medium"
      >
        {titleLines[0]}
      </text>
      {titleLines[1] !== undefined ? (
        <text
          x={TEXT_INSET_X}
          y={TITLE_SECOND_LINE_Y}
          className="fill-foreground text-3xs font-medium"
        >
          {titleLines[1]}
        </text>
      ) : null}
      <text x={TEXT_INSET_X} y={FOOTER_Y} className="fill-muted-foreground/70 font-mono text-4xs">
        {shortBoardId(node.id)}
      </text>
      <text
        x={node.width - TEXT_INSET_X}
        y={FOOTER_Y}
        textAnchor="end"
        fill="currentColor"
        className={`${node.colourClass} text-3xs`}
      >
        {node.glyph}
      </text>
      {node.badge !== null ? (
        <>
          <circle
            cx={node.width - BADGE_INSET}
            cy={BADGE_INSET}
            r={BADGE_RADIUS}
            className={node.badge === "human" ? "fill-error" : "fill-warning"}
          />
          <text
            x={node.width - BADGE_INSET}
            y={BADGE_INSET + BADGE_GLYPH_DROP}
            textAnchor="middle"
            className={
              node.badge === "human"
                ? "fill-white text-4xs font-bold"
                : "fill-warning-foreground text-4xs font-bold"
            }
          >
            ?
          </text>
        </>
      ) : null}
    </>
  );
}

function MapNode({
  node,
  onFocusIssue,
}: {
  readonly node: FocusNodeViewModel;
  readonly onFocusIssue: (issueId: string) => void;
}) {
  const transform = `translate(${node.x}, ${node.y})`;
  if (node.isFocus) {
    return (
      <g
        transform={transform}
        role="img"
        aria-current="true"
        aria-label={`${node.title} - ${node.statusLabel} - this ticket`}
      >
        <MapNodeFace node={node} />
      </g>
    );
  }
  const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onFocusIssue(node.id);
  };
  return (
    <g
      transform={transform}
      role="button"
      tabIndex={0}
      aria-label={`${node.title} - ${node.statusLabel}`}
      className="cursor-pointer outline-none hover:opacity-80 focus-visible:outline-1 focus-visible:outline-primary"
      onClick={() => onFocusIssue(node.id)}
      onKeyDown={handleKeyDown}
    >
      <MapNodeFace node={node} />
    </g>
  );
}

function MapOverflow({ graph }: { readonly graph: FocusGraph }) {
  if (graph.overflow === null) return null;
  const { x, y, width, height } = graph.overflow;
  return (
    <g transform={`translate(${x}, ${y})`} role="img" aria-label={`${graph.hidden} more outside`}>
      <rect
        width={width}
        height={height}
        rx={NODE_CORNER_RADIUS}
        fill="none"
        strokeDasharray={BLOCKED_DASH}
        className="stroke-muted-foreground/40"
      />
      <text
        x={width / 2}
        y={height / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-muted-foreground text-3xs"
      >
        {`${graph.hidden} more outside`}
      </text>
    </g>
  );
}

export function MapView({ graph, onFocusIssue }: MapViewProps) {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const width = graph.layout.width + VIEW_MARGIN * 2;
  const height = graph.layout.height + VIEW_MARGIN * 2;
  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`${-VIEW_MARGIN} ${-VIEW_MARGIN} ${width} ${height}`}
        width={width}
        height={height}
        className="mx-auto"
        role="group"
        aria-label="Ticket relation map"
      >
        <defs>
          <marker
            id="bc-map-arrow-muted"
            viewBox="0 0 10 10"
            refX={9}
            refY={5}
            markerWidth={7}
            markerHeight={7}
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground/60" />
          </marker>
          <marker
            id="bc-map-cross"
            viewBox="0 0 12 12"
            refX={6}
            refY={6}
            markerWidth={9}
            markerHeight={9}
            orient="auto"
          >
            <path
              d="M 2 2 L 10 10 M 10 2 L 2 10"
              className="stroke-error/80"
              strokeWidth={2}
              fill="none"
            />
          </marker>
        </defs>
        {graph.edges.map((edge) => {
          const from = nodesById.get(edge.from);
          const to = nodesById.get(edge.to);
          if (from === undefined || to === undefined) return null;
          return <MapEdge key={edge.key} edge={edge} path={edgePath(from, to, edge)} />;
        })}
        {graph.nodes.map((node) => (
          <MapNode key={node.id} node={node} onFocusIssue={onFocusIssue} />
        ))}
        <MapOverflow graph={graph} />
      </svg>
    </div>
  );
}
