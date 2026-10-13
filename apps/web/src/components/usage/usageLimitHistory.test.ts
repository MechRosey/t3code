import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { collectLimitAccounts, collectLimitPools } from "@t3tools/shared/usageLimits";
import { describe, expect, it } from "vite-plus/test";

import {
  CHUNK_MS,
  SPARKLINE_HEIGHT_PX,
  USED_PERCENT_RESET_TOLERANCE,
  appendSample,
  chunkUsage,
  meanChunks,
  poolSparkline,
  recordPresentations,
  recordedSamples,
  sparklinePoints,
  type UsageSample,
} from "./usageLimitHistory";

const MINUTE_MS = 60_000;
const SESSION_MINUTES = 300;
const PRESENTATION_NOW_MS = Date.parse("2026-09-03T12:00:00.000Z");
const BASE_MS = 400 * CHUNK_MS;

const sample = (minutes: number, usedPercent: number): UsageSample => ({
  checkedAtMs: BASE_MS + minutes * MINUTE_MS,
  usedPercent,
});

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

const heightOf = (point: { readonly y: number }) => SPARKLINE_HEIGHT_PX - point.y;

describe("appendSample", () => {
  it("keeps one sample per checkedAt and restarts the series when usedPercent falls", () => {
    const retainMs = SESSION_MINUTES * MINUTE_MS;

    const first = appendSample([], sample(0, 10), retainMs);
    const duplicate = appendSample(first, sample(0, 10), retainMs);
    const rising = appendSample(duplicate, sample(5, 14), retainMs);
    const afterReset = appendSample(rising, sample(10, 2), retainMs);

    expect(duplicate).toBe(first);
    expect(rising).toEqual([sample(0, 10), sample(5, 14)]);
    expect(afterReset).toEqual([sample(10, 2)]);
  });

  it("treats a fall within tolerance as jitter: keeps the series at the high-water mark and counts no phantom rise", () => {
    const retainMs = SESSION_MINUTES * MINUTE_MS;
    const jittered = 57 - USED_PERCENT_RESET_TOLERANCE / 2;
    let samples: readonly UsageSample[] = [];

    samples = appendSample(samples, sample(0, 40), retainMs);
    samples = appendSample(samples, sample(5, 57), retainMs);
    samples = appendSample(samples, sample(10, jittered), retainMs);
    samples = appendSample(samples, sample(15, 57), retainMs);
    samples = appendSample(samples, sample(20, 60), retainMs);

    expect(samples).toEqual([
      sample(0, 40),
      sample(5, 57),
      sample(10, 57),
      sample(15, 57),
      sample(20, 60),
    ]);
    expect(sum(chunkUsage(samples, BASE_MS, 5))).toBeCloseTo(20, 9);
  });

  it("restarts the series when usedPercent falls by more than the tolerance", () => {
    const retainMs = SESSION_MINUTES * MINUTE_MS;
    const start = appendSample([], sample(0, 40), retainMs);

    const afterReset = appendSample(
      start,
      sample(5, 40 - USED_PERCENT_RESET_TOLERANCE - 1),
      retainMs,
    );

    expect(afterReset).toEqual([sample(5, 40 - USED_PERCENT_RESET_TOLERANCE - 1)]);
  });

  it("drops samples older than the retention except the one that anchors the oldest rise", () => {
    const retainMs = 20 * MINUTE_MS;
    let samples: readonly UsageSample[] = [];

    for (const minutes of [0, 5, 10, 15, 20, 25, 30]) {
      samples = appendSample(samples, sample(minutes, minutes), retainMs);
    }

    expect(samples.map((entry) => entry.checkedAtMs)).toEqual(
      [5, 10, 15, 20, 25, 30].map((minutes) => sample(minutes, 0).checkedAtMs),
    );
  });
});

describe("chunkUsage", () => {
  it("conserves the sum of positive rises however the samples are spaced", () => {
    const samples = [
      sample(1, 0),
      sample(2, 3),
      sample(14, 9),
      sample(14.5, 9),
      sample(61, 20),
      sample(63, 21.5),
      sample(200, 40),
    ];
    const rises = 3 + 6 + 11 + 1.5 + 18.5;

    const chunks = chunkUsage(samples, BASE_MS, SESSION_MINUTES / 5);

    expect(sum(chunks)).toBeCloseTo(rises, 9);
  });

  it("splits a rise across the chunks its interval touches in proportion to the time in each", () => {
    const samples = [sample(1, 10), sample(11, 20)];

    const chunks = chunkUsage(samples, BASE_MS, 4);

    expect(chunks[0]).toBeCloseTo(4, 9);
    expect(chunks[1]).toBeCloseTo(5, 9);
    expect(chunks[2]).toBeCloseTo(1, 9);
    expect(chunks[3]).toBe(0);
  });

  it("counts nothing for a fall between samples", () => {
    const samples = [sample(0, 50), sample(5, 10), sample(10, 12)];

    const chunks = chunkUsage(samples, BASE_MS, 3);

    expect(chunks).toEqual([0, 2, 0]);
  });

  it("ignores rises outside the requested range", () => {
    const samples = [sample(-10, 0), sample(-5, 7), sample(0, 7), sample(5, 7)];

    const chunks = chunkUsage(samples, BASE_MS, 1);

    expect(chunks).toEqual([0]);
  });
});

describe("meanChunks", () => {
  it("averages the members' values chunk by chunk", () => {
    const chunks = meanChunks([
      [10, 0, 4],
      [20, 0, 0],
    ]);

    expect(chunks).toEqual([15, 0, 2]);
  });

  it("returns no chunks for no members", () => {
    expect(meanChunks([])).toEqual([]);
  });
});

describe("sparklinePoints", () => {
  it("plots the tallest chunk at the full height and the rest in proportion", () => {
    const points = sparklinePoints([0, 5, 20, 10]);

    expect(points.map(heightOf)).toEqual([0, 12.5, SPARKLINE_HEIGHT_PX, 25]);
    expect(points.map((point) => point.x)).toEqual([0.5, 1.5, 2.5, 3.5]);
  });

  it("plots nothing when every chunk is zero", () => {
    expect(sparklinePoints([0, 0, 0])).toEqual([]);
  });

  it("plots only the chunks that have started", () => {
    const points = sparklinePoints([4, 8, 0, 0], 2);

    expect(points.map(heightOf)).toEqual([25, SPARKLINE_HEIGHT_PX]);
  });

  it("normalises by the tallest visible chunk and ignores hidden ones", () => {
    const points = sparklinePoints([1, 2, 40, 0], 2);

    expect(points.map(heightOf)).toEqual([SPARKLINE_HEIGHT_PX / 2, SPARKLINE_HEIGHT_PX]);
  });

  it("plots nothing when every visible chunk is zero even if a hidden one is not", () => {
    expect(sparklinePoints([0, 0, 9], 2)).toEqual([]);
  });
});

describe("recordPresentations", () => {
  const checkedAtOf = (minutesBeforeNow: number) =>
    new Date(PRESENTATION_NOW_MS - minutesBeforeNow * MINUTE_MS).toISOString();
  const claude = ProviderDriverKind.make("claudeAgent");
  const presentationsAt = (checkedAt: string, usedPercent: number) =>
    new Map(
      ["env-pool-a", "env-pool-b"].map((environmentId) => [
        EnvironmentId.make(environmentId),
        {
          entry: { target: { label: environmentId } },
          serverConfig: {
            providers: [
              {
                instanceId: ProviderInstanceId.make("claude-pool"),
                driver: claude,
                enabled: true,
                installed: true,
                version: null,
                status: "ready",
                auth: { status: "authenticated", email: "pool@example.com" },
                checkedAt,
                models: [],
                slashCommands: [],
                skills: [],
                usageLimits: {
                  checkedAt,
                  windows: [
                    {
                      id: "five_hour",
                      kind: "session",
                      label: "Session",
                      usedPercent,
                      windowDurationMins: SESSION_MINUTES,
                    },
                  ],
                },
              } satisfies ServerProvider,
            ],
          },
        },
      ]),
    );
  const sparklineFor = (presentations: ReturnType<typeof presentationsAt>) => {
    const pool = collectLimitPools(collectLimitAccounts(presentations), PRESENTATION_NOW_MS)[0];
    return poolSparkline(pool!.windows[0]!, recordedSamples, PRESENTATION_NOW_MS);
  };

  it("resolves one account's samples through the unfiltered set and through either environment alone", () => {
    const everything = presentationsAt(checkedAtOf(10), 10);
    const later = presentationsAt(checkedAtOf(5), 20);

    recordPresentations(everything);
    recordPresentations(later);

    const expected = [SPARKLINE_HEIGHT_PX];
    for (const presentations of [later, new Map([[...later][0]!]), new Map([[...later][1]!])]) {
      const heights = sparklineFor(presentations)?.points.map(heightOf) ?? [];
      expect(heights.filter((height) => height > 0)).toEqual(expected);
    }
  });
});

describe("poolSparkline", () => {
  const member = (key: string, windowId: string, extra: Record<string, unknown> = {}) => ({
    account: { key },
    window: {
      id: windowId,
      kind: "session" as const,
      windowDurationMins: SESSION_MINUTES,
      ...extra,
    },
  });
  const historyOf =
    (series: Record<string, readonly UsageSample[]>) => (accountKey: string, windowId: string) =>
      series[`${accountKey}|${windowId}`] ?? [];

  it("aligns a single account with a known reset to the real window and leaves the future blank", () => {
    const resetsAt = new Date(BASE_MS + SESSION_MINUTES * MINUTE_MS).toISOString();
    const pool = { members: [member("a", "five_hour", { resetsAt })] };
    const history = historyOf({ "a|five_hour": [sample(0, 0), sample(5, 10), sample(10, 15)] });

    const sparkline = poolSparkline(pool, history, BASE_MS + 12 * MINUTE_MS);

    expect(sparkline?.chunkCount).toBe(SESSION_MINUTES / 5);
    expect(sparkline?.points.map(heightOf)).toEqual([SPARKLINE_HEIGHT_PX, 25, 0]);
  });

  it("rolls the last window ending now for a multi-account pool and plots the mean", () => {
    const pool = { members: [member("a", "five_hour"), member("b", "five_hour")] };
    const history = historyOf({
      "a|five_hour": [sample(0, 0), sample(5, 10), sample(10, 15)],
      "b|five_hour": [sample(0, 0), sample(5, 20), sample(10, 20)],
    });

    const sparkline = poolSparkline(pool, history, BASE_MS + 12 * MINUTE_MS);

    expect(sparkline?.chunkCount).toBe(SESSION_MINUTES / 5);
    expect(sparkline?.points).toHaveLength(SESSION_MINUTES / 5);
    const heights = sparkline?.points.map(heightOf) ?? [];
    expect(heights[57]).toBe(SPARKLINE_HEIGHT_PX);
    expect(heights[58]).toBeCloseTo(SPARKLINE_HEIGHT_PX / 6, 9);
    expect(heights[56]).toBe(0);
  });

  it("keeps samples recorded after the page's now: the rolling grid extends to the newest sample", () => {
    const pool = { members: [member("a", "five_hour"), member("b", "five_hour")] };
    const history = historyOf({
      "a|five_hour": [sample(0, 0), sample(5, 10), sample(10, 15)],
      "b|five_hour": [sample(0, 0), sample(5, 10), sample(10, 15)],
    });

    const sparkline = poolSparkline(pool, history, BASE_MS);

    const heights = sparkline?.points.map(heightOf) ?? [];
    expect(heights.slice(-3)).toEqual([SPARKLINE_HEIGHT_PX, SPARKLINE_HEIGHT_PX / 2, 0]);
  });

  it("shows aligned chunks for samples newer than the page's now and normalises over them", () => {
    const resetsAt = new Date(BASE_MS + SESSION_MINUTES * MINUTE_MS).toISOString();
    const pool = { members: [member("a", "five_hour", { resetsAt })] };
    const history = historyOf({ "a|five_hour": [sample(0, 0), sample(5, 10), sample(10, 15)] });

    const sparkline = poolSparkline(pool, history, BASE_MS + MINUTE_MS);

    expect(sparkline?.points.map(heightOf)).toEqual([
      SPARKLINE_HEIGHT_PX,
      SPARKLINE_HEIGHT_PX / 2,
      0,
    ]);
  });

  it("finds each member's history under its own window id", () => {
    const pool = { members: [member("a", "primary"), member("b", "secondary")] };
    const history = historyOf({
      "a|primary": [sample(0, 0), sample(5, 10)],
      "b|secondary": [sample(0, 0), sample(5, 10)],
    });

    const sparkline = poolSparkline(pool, history, BASE_MS + 12 * MINUTE_MS);

    expect(sparkline?.points.map(heightOf).filter((height) => height > 0)).toEqual([
      SPARKLINE_HEIGHT_PX,
    ]);
  });

  it("returns nothing without activity, without a window length, or for a weekly window", () => {
    const quiet = historyOf({ "a|five_hour": [sample(0, 5), sample(5, 5)] });
    const busy = historyOf({ "a|five_hour": [sample(0, 5), sample(5, 9)] });
    const now = BASE_MS + 12 * MINUTE_MS;

    expect(poolSparkline({ members: [member("a", "five_hour")] }, quiet, now)).toBeNull();
    expect(
      poolSparkline(
        { members: [member("a", "five_hour", { windowDurationMins: undefined })] },
        busy,
        now,
      ),
    ).toBeNull();
    expect(
      poolSparkline({ members: [member("a", "five_hour", { kind: "weekly" })] }, busy, now),
    ).toBeNull();
  });
});
