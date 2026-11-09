import type { KeyboardEvent, ReactNode } from "react";

import { shortBoardId } from "./boardCopy.logic";
import {
  mapTitleLines,
  TEXT_INSET_X,
  type FocusConnectorViewModel,
  type FocusGraph,
  type FocusLabelViewModel,
  type FocusNodeViewModel,
  type FocusOverflowViewModel,
  type FocusZone,
} from "./mapView.logic";

const NODE_CORNER_RADIUS = 8;
const FOCUS_RING_GAP = 3;
const VIEW_MARGIN = 5;
const FLAGGED_STROKE_WIDTH = 2;
const DEFAULT_STROKE_WIDTH = 1;
const BUS_STROKE_WIDTH = 1.5;
const BLOCKED_DASH = "4 3";
const TITLE_FIRST_LINE_Y = 19;
const TITLE_SECOND_LINE_Y = 30;
const FOOTER_Y = 41;
const BADGE_RADIUS = 6;
const BADGE_INSET = 8;
const BADGE_GLYPH_DROP = 2.5;
const KEY_SWATCH_WIDTH = 24;
const KEY_SWATCH_HEIGHT = 12;
const KEY_ARROW_LENGTH = 6;
const KEY_ARROW_HALF_HEIGHT = 3;
const KEY_CROSS_SIZE = 6;
const KEY_NODE_CORNER_RADIUS = 3;

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

interface MapViewProps {
  readonly graph: FocusGraph;
  readonly onFocusIssue: (issueId: string) => void;
}

const ZONE_NODE_PREFIX: Record<FocusZone, string> = {
  parent: "Parent",
  siblings: "Sibling",
  children: "Child",
  blockedBy: "Blocked by",
  blocking: "Blocking",
};

const ZONE_NOUNS: Record<FocusZone, string> = {
  parent: "parent",
  siblings: "siblings",
  children: "children",
  blockedBy: "blockers",
  blocking: "blocked tickets",
};

function connectorPath(connector: FocusConnectorViewModel): string {
  return `M ${connector.x1} ${connector.y1} L ${connector.x2} ${connector.y2}`;
}

function MapConnector({ connector }: { readonly connector: FocusConnectorViewModel }) {
  const path = connectorPath(connector);
  if (connector.role === "bus") {
    return (
      <path
        d={path}
        className={connector.kind === "blocks" ? "stroke-error/80" : "stroke-muted-foreground/50"}
        strokeWidth={BUS_STROKE_WIDTH}
        fill="none"
      />
    );
  }
  if (connector.kind === "blocks") {
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
  if (connector.kind === "peer") {
    return (
      <path
        d={path}
        className="stroke-muted-foreground/40"
        strokeWidth={DEFAULT_STROKE_WIDTH}
        strokeDasharray="2 4"
        fill="none"
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

function MapNodeFace({
  node,
  titleChars,
}: {
  readonly node: FocusNodeViewModel;
  readonly titleChars: number;
}) {
  const titleLines = mapTitleLines(node.title, titleChars);
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
      {node.zone === null ? (
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
  titleChars,
  onFocusIssue,
}: {
  readonly node: FocusNodeViewModel;
  readonly titleChars: number;
  readonly onFocusIssue: (issueId: string) => void;
}) {
  const transform = `translate(${node.x}, ${node.y})`;
  const { zone } = node;
  if (zone === null) {
    return (
      <g
        transform={transform}
        role="img"
        aria-current="true"
        aria-label={`${node.title} - ${node.statusLabel} - this ticket`}
      >
        <MapNodeFace node={node} titleChars={titleChars} />
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
      aria-label={`${ZONE_NODE_PREFIX[zone]}: ${node.title} - ${node.statusLabel}`}
      className="cursor-pointer outline-none hover:opacity-80 focus-visible:outline-1 focus-visible:outline-primary"
      onClick={() => onFocusIssue(node.id)}
      onKeyDown={handleKeyDown}
    >
      <MapNodeFace node={node} titleChars={titleChars} />
    </g>
  );
}

function MapOverflow({ overflow }: { readonly overflow: FocusOverflowViewModel }) {
  return (
    <text
      x={overflow.x}
      y={overflow.y}
      textAnchor="middle"
      role="img"
      aria-label={`${overflow.hidden} more ${ZONE_NOUNS[overflow.zone]}`}
      className="fill-muted-foreground text-3xs"
    >
      {overflow.text}
    </text>
  );
}

function MapZoneLabel({ label }: { readonly label: FocusLabelViewModel }) {
  return (
    <text
      x={label.x}
      y={label.y}
      textAnchor="middle"
      className="fill-muted-foreground text-3xs font-medium"
    >
      {label.text}
    </text>
  );
}

function KeySwatch({ children }: { readonly children: ReactNode }) {
  return (
    <svg
      width={KEY_SWATCH_WIDTH}
      height={KEY_SWATCH_HEIGHT}
      viewBox={`0 0 ${KEY_SWATCH_WIDTH} ${KEY_SWATCH_HEIGHT}`}
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

const KEY_LINE_Y = KEY_SWATCH_HEIGHT / 2;

function KeyTreeSwatch() {
  return (
    <KeySwatch>
      <path
        d={`M 0 ${KEY_LINE_Y} L ${KEY_SWATCH_WIDTH - KEY_ARROW_LENGTH} ${KEY_LINE_Y}`}
        className="stroke-muted-foreground/50"
        strokeWidth={BUS_STROKE_WIDTH}
        fill="none"
      />
      <path
        d={`M ${KEY_SWATCH_WIDTH - KEY_ARROW_LENGTH} ${KEY_LINE_Y - KEY_ARROW_HALF_HEIGHT} L ${KEY_SWATCH_WIDTH} ${KEY_LINE_Y} L ${KEY_SWATCH_WIDTH - KEY_ARROW_LENGTH} ${KEY_LINE_Y + KEY_ARROW_HALF_HEIGHT} z`}
        className="fill-muted-foreground/60"
      />
    </KeySwatch>
  );
}

function KeyPeerSwatch() {
  return (
    <KeySwatch>
      <path
        d={`M 0 ${KEY_LINE_Y} L ${KEY_SWATCH_WIDTH} ${KEY_LINE_Y}`}
        className="stroke-muted-foreground/40"
        strokeWidth={DEFAULT_STROKE_WIDTH}
        strokeDasharray="2 4"
        fill="none"
      />
    </KeySwatch>
  );
}

function KeyBlocksSwatch() {
  const crossStart = KEY_SWATCH_WIDTH - KEY_CROSS_SIZE;
  return (
    <KeySwatch>
      <path
        d={`M 0 ${KEY_LINE_Y} L ${crossStart} ${KEY_LINE_Y}`}
        className="stroke-error/80"
        strokeWidth={BUS_STROKE_WIDTH}
        strokeDasharray="6 4"
        fill="none"
      />
      <path
        d={`M ${crossStart} ${KEY_LINE_Y - KEY_CROSS_SIZE / 2} L ${KEY_SWATCH_WIDTH} ${KEY_LINE_Y + KEY_CROSS_SIZE / 2} M ${KEY_SWATCH_WIDTH} ${KEY_LINE_Y - KEY_CROSS_SIZE / 2} L ${crossStart} ${KEY_LINE_Y + KEY_CROSS_SIZE / 2}`}
        className="stroke-error/80"
        strokeWidth={FLAGGED_STROKE_WIDTH}
        fill="none"
      />
    </KeySwatch>
  );
}

function KeyNodeSwatch({
  strokeClass,
  strokeWidth,
}: {
  readonly strokeClass: string;
  readonly strokeWidth: number;
}) {
  return (
    <KeySwatch>
      <rect
        x={strokeWidth}
        y={strokeWidth}
        width={KEY_SWATCH_WIDTH - strokeWidth * 2}
        height={KEY_SWATCH_HEIGHT - strokeWidth * 2}
        rx={KEY_NODE_CORNER_RADIUS}
        fill="none"
        strokeWidth={strokeWidth}
        className={strokeClass}
      />
    </KeySwatch>
  );
}

function KeyRingSwatch() {
  const ringRadius = KEY_SWATCH_HEIGHT / 2 - FLAGGED_STROKE_WIDTH;
  return (
    <KeySwatch>
      <circle
        cx={KEY_SWATCH_WIDTH / 2}
        cy={KEY_LINE_Y}
        r={ringRadius}
        fill="none"
        strokeWidth={FLAGGED_STROKE_WIDTH}
        className="stroke-foreground"
      />
    </KeySwatch>
  );
}

const KEY_ENTRIES: ReadonlyArray<{ readonly text: string; readonly swatch: ReactNode }> = [
  { text: "child to parent", swatch: <KeyTreeSwatch /> },
  { text: "sibling", swatch: <KeyPeerSwatch /> },
  { text: "blocks", swatch: <KeyBlocksSwatch /> },
  {
    text: "has open children",
    swatch: <KeyNodeSwatch strokeClass="stroke-warning" strokeWidth={FLAGGED_STROKE_WIDTH} />,
  },
  { text: "this ticket", swatch: <KeyRingSwatch /> },
];

function MapKey() {
  return (
    <ul className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-3xs text-muted-foreground">
      {KEY_ENTRIES.map((entry) => (
        <li key={entry.text} className="flex items-center gap-1">
          {entry.swatch}
          <span>{entry.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function MapView({ graph, onFocusIssue }: MapViewProps) {
  return (
    <div>
      <MapDiagram graph={graph} onFocusIssue={onFocusIssue} />
      <MapKey />
    </div>
  );
}

function MapDiagram({ graph, onFocusIssue }: MapViewProps) {
  const width = graph.layout.width + VIEW_MARGIN * 2;
  const height = graph.layout.height + VIEW_MARGIN * 2;
  return (
    <svg
      viewBox={`${-VIEW_MARGIN} ${-VIEW_MARGIN} ${width} ${height}`}
      style={{ maxWidth: width }}
      className="mx-auto block h-auto w-full"
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
      {graph.connectors.map((connector) => (
        <MapConnector key={`${connector.zone}-${connector.role}`} connector={connector} />
      ))}
      {graph.labels.map((label) => (
        <MapZoneLabel key={label.zone} label={label} />
      ))}
      {graph.nodes.map((node) => (
        <MapNode
          key={node.id}
          node={node}
          titleChars={graph.layout.titleChars}
          onFocusIssue={onFocusIssue}
        />
      ))}
      {graph.overflows.map((overflow) => (
        <MapOverflow key={overflow.zone} overflow={overflow} />
      ))}
    </svg>
  );
}
