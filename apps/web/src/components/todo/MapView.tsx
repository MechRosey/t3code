import type { CSSProperties } from "react";

import { shortBoardId } from "./boardCopy.logic";
import {
  mapTitleLines,
  type MapEdgeViewModel,
  type MapNodeViewModel,
  type MapViewModel,
} from "./mapView.logic";

const MAP_TITLE_MAX_CHARS = 26;

interface MapViewProps {
  readonly model: MapViewModel;
  readonly onNodeOpen: (issueId: string) => void;
}

function nodeHueStyle(node: MapNodeViewModel): CSSProperties | undefined {
  return node.hue === null ? undefined : ({ "--card-hue": String(node.hue) } as CSSProperties);
}

function edgePath(nodesById: Map<string, MapNodeViewModel>, edge: MapEdgeViewModel): string | null {
  const from = nodesById.get(edge.from);
  const to = nodesById.get(edge.to);
  if (from === undefined || to === undefined) return null;
  if (edge.kind === "tree") {
    const x1 = from.x + from.width / 2;
    const y1 = from.y;
    const x2 = to.x + to.width / 2;
    const y2 = to.y + to.height;
    const midY = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  }
  const x1 = from.x + from.width / 2;
  const y1 = from.y + from.height / 2;
  const x2 = to.x + to.width / 2;
  const y2 = to.y + to.height / 2;
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

function MapEdge({
  edge,
  path,
}: {
  readonly edge: MapEdgeViewModel;
  readonly path: string | null;
}) {
  if (path === null) return null;
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

function MapNode({
  node,
  onOpen,
}: {
  readonly node: MapNodeViewModel;
  readonly onOpen: () => void;
}) {
  const titleLines = mapTitleLines(node.title, MAP_TITLE_MAX_CHARS);
  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      className="cursor-pointer"
      role="button"
      aria-label={`${node.title} - ${node.statusLabel}`}
      onClick={onOpen}
    >
      <rect
        width={node.width}
        height={node.height}
        rx={10}
        style={nodeHueStyle(node)}
        className={mapNodeClass(node)}
      />
      <text x={12} y={25} className="fill-foreground/90 text-[11px] font-medium">
        {titleLines[0]}
      </text>
      {titleLines[1] !== undefined ? (
        <text x={12} y={40} className="fill-foreground/90 text-[11px] font-medium">
          {titleLines[1]}
        </text>
      ) : null}
      <text x={12} y={55} className="fill-muted-foreground/70 font-mono text-[9px]">
        {shortBoardId(node.id)}
      </text>
      <text
        x={node.width - 14}
        y={55}
        textAnchor="end"
        fill="currentColor"
        className={node.colourClass}
      >
        {node.glyph}
      </text>
      {node.badge !== null ? (
        <>
          <circle
            cx={node.width - 14}
            cy={16}
            r={8}
            className={node.badge === "human" ? "fill-error" : "fill-warning"}
          />
          <text
            x={node.width - 14}
            y={19.5}
            textAnchor="middle"
            className={
              node.badge === "human"
                ? "fill-white text-[9px] font-bold"
                : "fill-warning-foreground text-[9px] font-bold"
            }
          >
            ?
          </text>
        </>
      ) : null}
    </g>
  );
}

function mapNodeClass(node: MapNodeViewModel): string {
  if (node.status === "blocked") return "board-map-node board-map-node-blocked";
  if (!node.tinted) return "board-map-node";
  return node.isRoot ? "board-map-node board-map-node-root" : "board-map-node board-map-node-child";
}

export function MapView({ model, onNodeOpen }: MapViewProps) {
  const nodesById = new Map(model.nodes.map((node) => [node.id, node] as const));
  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-3">
      <svg
        viewBox={`0 0 ${Math.max(model.layout.width, 1)} ${Math.max(model.layout.height, 1)}`}
        width={model.layout.width}
        height={model.layout.height}
        className="max-h-full max-w-full"
        preserveAspectRatio="xMidYMin meet"
        role="img"
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
        {model.edges.map((edge) => (
          <MapEdge key={edge.key} edge={edge} path={edgePath(nodesById, edge)} />
        ))}
        {model.nodes.map((node) => (
          <MapNode key={node.id} node={node} onOpen={() => onNodeOpen(node.id)} />
        ))}
      </svg>
    </div>
  );
}
