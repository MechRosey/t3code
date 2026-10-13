import type { LimitPoolWindow } from "@t3tools/shared/usageLimits";
import { useSyncExternalStore } from "react";

import {
  SPARKLINE_HEIGHT_PX,
  limitHistoryVersion,
  poolSparkline,
  recordedSamples,
  subscribeLimitHistory,
} from "./usageLimitHistory";

const SPARKLINE_STROKE_WIDTH = 1.5;

export function UsageSparkline({
  pool,
  color,
  now,
}: {
  readonly pool: LimitPoolWindow;
  readonly color: string;
  readonly now: number;
}) {
  useSyncExternalStore(subscribeLimitHistory, limitHistoryVersion);
  const sparkline = poolSparkline(pool, recordedSamples, now);
  if (sparkline === null) return null;
  return (
    <svg
      role="img"
      aria-label="Quota used per 5 minutes"
      viewBox={`0 0 ${sparkline.chunkCount} ${SPARKLINE_HEIGHT_PX}`}
      preserveAspectRatio="none"
      className="mt-2 w-full overflow-visible"
      style={{ height: SPARKLINE_HEIGHT_PX }}
    >
      <polyline
        points={sparkline.points.map((point) => `${point.x},${point.y}`).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={SPARKLINE_STROKE_WIDTH}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
