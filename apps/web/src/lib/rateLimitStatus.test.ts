import { describe, expect, it } from "vite-plus/test";
import { EventId, type OrchestrationThreadActivity, TurnId } from "@t3tools/contracts";

import { deriveLatestRateLimitSnapshots, formatRateLimitBucketLabel } from "./rateLimitStatus";

function makeActivity(id: string, kind: string, payload: unknown): OrchestrationThreadActivity {
  return {
    id: EventId.make(id),
    tone: "info",
    kind,
    summary: kind,
    payload,
    turnId: TurnId.make("turn-1"),
    createdAt: "2026-03-23T00:00:00.000Z",
  };
}

describe("deriveLatestRateLimitSnapshots", () => {
  it("keeps the latest snapshot per bucket, independent of other buckets", () => {
    const snapshots = deriveLatestRateLimitSnapshots([
      makeActivity("activity-1", "account.rate-limits.updated", {
        status: "allowed",
        rateLimitType: "five_hour",
        utilization: 10,
      }),
      makeActivity("activity-2", "account.rate-limits.updated", {
        status: "allowed_warning",
        rateLimitType: "seven_day_sonnet",
        utilization: 87.5,
      }),
      makeActivity("activity-3", "account.rate-limits.updated", {
        status: "allowed",
        rateLimitType: "five_hour",
        utilization: 25,
      }),
    ]);

    expect(snapshots.size).toBe(2);
    expect(snapshots.get("five_hour")?.utilization).toBe(25);
    expect(snapshots.get("seven_day_sonnet")?.utilization).toBe(87.5);
  });

  it("omits a bucket entirely when no activity ever reported a utilization percentage", () => {
    const snapshots = deriveLatestRateLimitSnapshots([
      makeActivity("activity-1", "tool.started", {}),
      makeActivity("activity-2", "account.rate-limits.updated", {
        status: "allowed",
        rateLimitType: "five_hour",
        // no utilization field
      }),
    ]);

    expect(snapshots.size).toBe(0);
  });

  it("ignores malformed payloads and unknown bucket names", () => {
    const snapshots = deriveLatestRateLimitSnapshots([
      makeActivity("activity-1", "account.rate-limits.updated", {}),
      makeActivity("activity-2", "account.rate-limits.updated", {
        status: "allowed",
        rateLimitType: "not-a-real-bucket",
        utilization: 50,
      }),
      makeActivity("activity-3", "account.rate-limits.updated", null),
    ]);

    expect(snapshots.size).toBe(0);
  });
});

describe("formatRateLimitBucketLabel", () => {
  it("labels every known bucket", () => {
    expect(formatRateLimitBucketLabel("five_hour")).toBe("5h");
    expect(formatRateLimitBucketLabel("seven_day")).toBe("7d");
    expect(formatRateLimitBucketLabel("seven_day_opus")).toBe("7d Opus");
    expect(formatRateLimitBucketLabel("seven_day_sonnet")).toBe("7d Sonnet");
    expect(formatRateLimitBucketLabel("overage")).toBe("Overage");
  });
});
