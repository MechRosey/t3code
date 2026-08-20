import { describe, expect, it } from "vite-plus/test";

import { buildRateLimitPills, hasStatusStripContent } from "./ComposerStatusStrip.logic";

describe("buildRateLimitPills", () => {
  it("orders pills shortest-window-first regardless of map insertion order", () => {
    const pills = buildRateLimitPills(
      new Map([
        [
          "seven_day_sonnet",
          { bucket: "seven_day_sonnet", status: "allowed", utilization: 10, resetsAt: null },
        ],
        ["five_hour", { bucket: "five_hour", status: "allowed", utilization: 20, resetsAt: null }],
      ]),
    );

    expect(pills.map((pill) => pill.bucket)).toEqual(["five_hour", "seven_day_sonnet"]);
  });

  it("maps status to tone and rounds the percentage", () => {
    const pills = buildRateLimitPills(
      new Map([
        [
          "five_hour",
          { bucket: "five_hour", status: "allowed", utilization: 12.4, resetsAt: null },
        ],
        [
          "seven_day",
          { bucket: "seven_day", status: "allowed_warning", utilization: 87.5, resetsAt: null },
        ],
        ["overage", { bucket: "overage", status: "rejected", utilization: 100, resetsAt: null }],
      ]),
    );

    expect(pills).toEqual([
      { bucket: "five_hour", label: "5h", percentageLabel: "12%", tone: "muted", resetsAt: null },
      {
        bucket: "seven_day",
        label: "7d",
        percentageLabel: "88%",
        tone: "warning",
        resetsAt: null,
      },
      {
        bucket: "overage",
        label: "Overage",
        percentageLabel: "100%",
        tone: "error",
        resetsAt: null,
      },
    ]);
  });

  it("carries each bucket's resetsAt through onto the pill", () => {
    const pills = buildRateLimitPills(
      new Map([
        [
          "five_hour",
          { bucket: "five_hour", status: "allowed", utilization: 12.4, resetsAt: 1780000000 },
        ],
      ]),
    );

    expect(pills).toEqual([
      {
        bucket: "five_hour",
        label: "5h",
        percentageLabel: "12%",
        tone: "muted",
        resetsAt: 1780000000,
      },
    ]);
  });

  it("returns an empty list when no bucket has a known snapshot", () => {
    expect(buildRateLimitPills(new Map())).toEqual([]);
  });
});

describe("hasStatusStripContent", () => {
  it("is true when a rate-limit pill exists even if not working", () => {
    const snapshots = new Map([
      ["five_hour", { bucket: "five_hour", status: "allowed", utilization: 12, resetsAt: null }],
    ] as const);

    expect(hasStatusStripContent(snapshots, false, null)).toBe(true);
  });

  it("is true when working with a start time even without any pills", () => {
    expect(hasStatusStripContent(new Map(), true, "2026-02-28T00:00:00.000Z")).toBe(true);
  });

  it("is false when there are no pills and no active working timer", () => {
    expect(hasStatusStripContent(new Map(), false, null)).toBe(false);
    expect(hasStatusStripContent(new Map(), true, null)).toBe(false);
  });
});
