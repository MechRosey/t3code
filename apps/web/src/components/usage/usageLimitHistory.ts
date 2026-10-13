import type { ServerProviderUsageWindow } from "@t3tools/contracts";
import {
  collectLimitAccounts,
  type LimitAccount,
  type LimitPresentations,
} from "@t3tools/shared/usageLimits";

const MINUTE_MS = 60_000;
const CHUNK_MINUTES = 5;

export const CHUNK_MS = CHUNK_MINUTES * MINUTE_MS;
export const SPARKLINE_HEIGHT_PX = 50;
export const USED_PERCENT_RESET_TOLERANCE = 1;

export interface UsageSample {
  readonly checkedAtMs: number;
  readonly usedPercent: number;
}

export interface SparklinePoint {
  readonly x: number;
  readonly y: number;
}

export interface Sparkline {
  readonly points: readonly SparklinePoint[];
  readonly chunkCount: number;
}

type SparklineWindow = Pick<
  ServerProviderUsageWindow,
  "id" | "kind" | "resetsAt" | "windowDurationMins"
>;

interface SparklineMember {
  readonly account: { readonly key: string };
  readonly window: SparklineWindow;
}

type SamplesFor = (accountKey: string, windowId: string) => readonly UsageSample[];

const NO_SAMPLES: readonly UsageSample[] = [];

function retainedSince(samples: readonly UsageSample[], cutoffMs: number): readonly UsageSample[] {
  const firstKept = samples.findIndex((entry) => entry.checkedAtMs >= cutoffMs);
  return samples.slice(Math.max(0, firstKept - 1));
}

export function appendSample(
  samples: readonly UsageSample[],
  sample: UsageSample,
  retainMs: number,
): readonly UsageSample[] {
  const last = samples.at(-1);
  if (last === undefined) return retainedSince([sample], sample.checkedAtMs - retainMs);
  if (sample.checkedAtMs <= last.checkedAtMs) return samples;
  const fall = last.usedPercent - sample.usedPercent;
  if (fall > USED_PERCENT_RESET_TOLERANCE) return [sample];
  const held = fall > 0 ? { ...sample, usedPercent: last.usedPercent } : sample;
  return retainedSince([...samples, held], sample.checkedAtMs - retainMs);
}

function spreadRise(
  chunks: number[],
  startMs: number,
  fromMs: number,
  toMs: number,
  rise: number,
): void {
  const risePerMs = rise / (toMs - fromMs);
  const firstChunk = Math.max(0, Math.floor((fromMs - startMs) / CHUNK_MS));
  const lastChunk = Math.min(chunks.length - 1, Math.floor((toMs - startMs) / CHUNK_MS));
  for (let index = firstChunk; index <= lastChunk; index += 1) {
    const chunkStartMs = startMs + index * CHUNK_MS;
    const overlapMs = Math.min(toMs, chunkStartMs + CHUNK_MS) - Math.max(fromMs, chunkStartMs);
    if (overlapMs > 0) chunks[index] = (chunks[index] ?? 0) + risePerMs * overlapMs;
  }
}

export function chunkUsage(
  samples: readonly UsageSample[],
  startMs: number,
  chunkCount: number,
): number[] {
  const chunks = Array.from({ length: chunkCount }, () => 0);
  for (let index = 1; index < samples.length; index += 1) {
    const from = samples[index - 1]!;
    const to = samples[index]!;
    const rise = to.usedPercent - from.usedPercent;
    if (rise > 0 && to.checkedAtMs > from.checkedAtMs) {
      spreadRise(chunks, startMs, from.checkedAtMs, to.checkedAtMs, rise);
    }
  }
  return chunks;
}

export function meanChunks(series: readonly (readonly number[])[]): number[] {
  const chunkCount = Math.max(0, ...series.map((chunks) => chunks.length));
  return Array.from(
    { length: chunkCount },
    (_, index) => series.reduce((total, chunks) => total + (chunks[index] ?? 0), 0) / series.length,
  );
}

export function sparklinePoints(
  chunks: readonly number[],
  visibleCount: number = chunks.length,
): SparklinePoint[] {
  const visible = chunks.slice(0, visibleCount);
  const tallest = Math.max(0, ...visible);
  if (tallest <= 0) return [];
  return visible.map((value, index) => ({
    x: index + 0.5,
    y: SPARKLINE_HEIGHT_PX - (value / tallest) * SPARKLINE_HEIGHT_PX,
  }));
}

export function isSparklineWindow(window: SparklineWindow): boolean {
  return window.kind !== "weekly" && (window.windowDurationMins ?? 0) > 0;
}

function parseMillis(iso: string | undefined): number | null {
  if (iso === undefined) return null;
  const millis = Date.parse(iso);
  return Number.isFinite(millis) ? millis : null;
}

interface ChunkGrid {
  readonly startMs: number;
  readonly chunkCount: number;
  readonly visibleCount: number;
}

function alignedGrid(
  resetsAtMs: number,
  durationMs: number,
  chunkCount: number,
  now: number,
): ChunkGrid {
  const startMs = resetsAtMs - durationMs;
  const started = Math.floor((now - startMs) / CHUNK_MS) + 1;
  return { startMs, chunkCount, visibleCount: Math.max(0, Math.min(chunkCount, started)) };
}

function rollingGrid(chunkCount: number, now: number): ChunkGrid {
  const endMs = (Math.floor(now / CHUNK_MS) + 1) * CHUNK_MS;
  return { startMs: endMs - chunkCount * CHUNK_MS, chunkCount, visibleCount: chunkCount };
}

function gridFor(members: readonly SparklineMember[], now: number): ChunkGrid {
  const window = members[0]!.window;
  const durationMs = (window.windowDurationMins ?? 0) * MINUTE_MS;
  const chunkCount = Math.ceil(durationMs / CHUNK_MS);
  const resetsAtMs = members.length === 1 ? parseMillis(window.resetsAt) : null;
  return resetsAtMs === null
    ? rollingGrid(chunkCount, now)
    : alignedGrid(resetsAtMs, durationMs, chunkCount, now);
}

export function poolSparkline(
  pool: { readonly members: readonly SparklineMember[] },
  samplesFor: SamplesFor,
  now: number,
): Sparkline | null {
  const first = pool.members[0];
  if (first === undefined || !isSparklineWindow(first.window)) return null;
  const memberSamples = pool.members.map((member) =>
    samplesFor(member.account.key, member.window.id),
  );
  const effectiveNow = Math.max(
    now,
    ...memberSamples.map((samples) => samples.at(-1)?.checkedAtMs ?? 0),
  );
  const grid = gridFor(pool.members, effectiveNow);
  const chunks = meanChunks(
    memberSamples.map((samples) => chunkUsage(samples, grid.startMs, grid.chunkCount)),
  );
  const points = sparklinePoints(chunks, grid.visibleCount);
  return points.length === 0 ? null : { points, chunkCount: grid.chunkCount };
}

const history = new Map<string, readonly UsageSample[]>();
const listeners = new Set<() => void>();
let version = 0;

const seriesKey = (accountKey: string, windowId: string) => JSON.stringify([accountKey, windowId]);

export const recordedSamples: SamplesFor = (accountKey, windowId) =>
  history.get(seriesKey(accountKey, windowId)) ?? NO_SAMPLES;

function recordWindow(
  accountKey: string,
  window: ServerProviderUsageWindow,
  checkedAtMs: number,
): boolean {
  const key = seriesKey(accountKey, window.id);
  const previous = history.get(key) ?? NO_SAMPLES;
  const retainMs = (window.windowDurationMins ?? 0) * MINUTE_MS + CHUNK_MS;
  const next = appendSample(previous, { checkedAtMs, usedPercent: window.usedPercent }, retainMs);
  if (next === previous) return false;
  history.set(key, next);
  return true;
}

export function recordLimitAccounts(accounts: readonly Pick<LimitAccount, "key" | "limits">[]) {
  let changed = false;
  for (const account of accounts) {
    const checkedAtMs = parseMillis(account.limits.checkedAt);
    if (checkedAtMs === null) continue;
    for (const window of account.limits.windows.filter(isSparklineWindow)) {
      changed = recordWindow(account.key, window, checkedAtMs) || changed;
    }
  }
  if (!changed) return;
  version += 1;
  for (const listener of listeners) listener();
}

export function recordPresentations(presentations: LimitPresentations) {
  recordLimitAccounts(
    [...presentations].flatMap(([environmentId, presentation]) =>
      collectLimitAccounts(new Map([[environmentId, presentation]])),
    ),
  );
}

export function subscribeLimitHistory(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const limitHistoryVersion = () => version;
