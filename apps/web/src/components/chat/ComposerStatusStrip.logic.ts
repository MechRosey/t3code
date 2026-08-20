import type { RateLimitBucket } from "@t3tools/contracts";
import { formatRateLimitBucketLabel, type RateLimitStatusSnapshot } from "~/lib/rateLimitStatus";

// Fixed, deterministic display order - shortest window first, mirroring how
// Claude Code's own statusline orders buckets.
const BUCKET_ORDER: ReadonlyArray<RateLimitBucket> = [
  "five_hour",
  "seven_day",
  "seven_day_opus",
  "seven_day_sonnet",
  "overage",
];

export type RateLimitPillTone = "muted" | "warning" | "error";

export interface RateLimitPill {
  readonly bucket: RateLimitBucket;
  readonly label: string;
  readonly percentageLabel: string;
  readonly tone: RateLimitPillTone;
  readonly resetsAt: number | null;
}

function toneForStatus(status: RateLimitStatusSnapshot["status"]): RateLimitPillTone {
  switch (status) {
    case "rejected":
      return "error";
    case "allowed_warning":
      return "warning";
    case "allowed":
      return "muted";
  }
}

/** Orders known buckets deterministically and formats each into a display-ready pill. */
export function buildRateLimitPills(
  snapshots: ReadonlyMap<RateLimitBucket, RateLimitStatusSnapshot>,
): ReadonlyArray<RateLimitPill> {
  const pills: Array<RateLimitPill> = [];
  for (const bucket of BUCKET_ORDER) {
    const snapshot = snapshots.get(bucket);
    if (!snapshot) {
      continue;
    }
    pills.push({
      bucket,
      label: formatRateLimitBucketLabel(bucket),
      percentageLabel: `${Math.round(snapshot.utilization)}%`,
      tone: toneForStatus(snapshot.status),
      resetsAt: snapshot.resetsAt,
    });
  }
  return pills;
}

/** Whether the status strip has anything to show - rate-limit pills or an active turn timer. */
export function hasStatusStripContent(
  rateLimitSnapshots: ReadonlyMap<RateLimitBucket, RateLimitStatusSnapshot>,
  isWorking: boolean,
  workingSince: string | null,
): boolean {
  return buildRateLimitPills(rateLimitSnapshots).length > 0 || (isWorking && workingSince !== null);
}
