import type { OrchestrationThreadActivity, RateLimitBucket } from "@t3tools/contracts";
import { asFiniteNumber, asRecord } from "@t3tools/shared/jsonValue";

const KNOWN_BUCKETS: ReadonlySet<string> = new Set([
  "five_hour",
  "seven_day",
  "seven_day_opus",
  "seven_day_sonnet",
  "overage",
]);

const KNOWN_STATUSES: ReadonlySet<string> = new Set(["allowed", "allowed_warning", "rejected"]);

function asKnownBucket(value: unknown): RateLimitBucket | null {
  return typeof value === "string" && KNOWN_BUCKETS.has(value) ? (value as RateLimitBucket) : null;
}

function asKnownStatus(value: unknown): "allowed" | "allowed_warning" | "rejected" | null {
  return typeof value === "string" && KNOWN_STATUSES.has(value)
    ? (value as "allowed" | "allowed_warning" | "rejected")
    : null;
}

/** Client-side mirror of the server-persisted Claude rate-limit snapshot. */
export type RateLimitStatusSnapshot = {
  readonly bucket: RateLimitBucket;
  readonly status: "allowed" | "allowed_warning" | "rejected";
  readonly utilization: number;
  readonly resetsAt: number | null;
};

/**
 * Folds `account.rate-limits.updated` activities into the latest snapshot per
 * bucket. The server never persists one without a numeric `utilization`, so
 * a bucket that never appears here must have its segment omitted entirely -
 * never rendered as a status-only or reset-time-only fallback.
 */
export function deriveLatestRateLimitSnapshots(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): ReadonlyMap<RateLimitBucket, RateLimitStatusSnapshot> {
  const latestByBucket = new Map<RateLimitBucket, RateLimitStatusSnapshot>();

  for (let index = activities.length - 1; index >= 0; index -= 1) {
    const activity = activities[index];
    if (!activity || activity.kind !== "account.rate-limits.updated") {
      continue;
    }

    const payload = asRecord(activity.payload);
    const bucket = asKnownBucket(payload?.rateLimitType);
    const status = asKnownStatus(payload?.status);
    const utilization = asFiniteNumber(payload?.utilization);
    if (!bucket || !status || utilization === null) {
      continue;
    }
    // Walking newest-first: the first entry seen for a bucket is its latest.
    if (latestByBucket.has(bucket)) {
      continue;
    }

    latestByBucket.set(bucket, {
      bucket,
      status,
      utilization,
      resetsAt: asFiniteNumber(payload?.resetsAt),
    });
  }

  return latestByBucket;
}

const BUCKET_LABELS: Record<RateLimitBucket, string> = {
  five_hour: "5h",
  seven_day: "7d",
  seven_day_opus: "7d Opus",
  seven_day_sonnet: "7d Sonnet",
  overage: "Overage",
};

export function formatRateLimitBucketLabel(bucket: RateLimitBucket): string {
  return BUCKET_LABELS[bucket];
}
