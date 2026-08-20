import { describe, expect, it } from "vite-plus/test";

import { buildRateLimitPills } from "./ComposerStatusStrip.logic";

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
      { bucket: "five_hour", label: "5h", percentageLabel: "12%", tone: "muted" },
      { bucket: "seven_day", label: "7d", percentageLabel: "88%", tone: "warning" },
      { bucket: "overage", label: "Overage", percentageLabel: "100%", tone: "error" },
    ]);
  });

  it("returns an empty list when no bucket has a known snapshot", () => {
    expect(buildRateLimitPills(new Map())).toEqual([]);
  });
});
