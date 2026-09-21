export type BoardDropActionMode = "read" | "doing";

export type BoardDropSpeed = "confirm" | "now" | "status-only";

export type BoardDropAction =
  | { readonly kind: "noop" }
  | { readonly kind: "status"; readonly status: string }
  | { readonly kind: "dispatch"; readonly mode: BoardDropActionMode };

export const BOARD_PIPELINE_STEPS = [
  "investigate",
  "implement",
  "verify",
  "review",
  "honesty",
] as const;

const BOARD_DISPATCH_STATUSES: ReadonlySet<string> = new Set(["read", "doing"]);

const BOARD_ROLLUP_STATUSES: ReadonlySet<string> = new Set(["done", "cancelled"]);

export function resolveBoardDropAction(
  sourceStatus: string,
  targetStatus: string,
  speed: BoardDropSpeed,
): BoardDropAction {
  if (sourceStatus === targetStatus) return { kind: "noop" };
  if (speed === "status-only") return { kind: "status", status: targetStatus };
  if (BOARD_DISPATCH_STATUSES.has(targetStatus)) {
    return { kind: "dispatch", mode: targetStatus as BoardDropActionMode };
  }
  return { kind: "status", status: targetStatus };
}

export function composeBoardDispatchPrompt(
  issueId: string,
  mode: BoardDropActionMode,
  notes: string | null | undefined,
): string {
  const verb = mode === "doing" ? "do" : "read";
  const base = `/todo -${verb} ${issueId}`;
  const trimmedNotes = notes?.trim() ?? "";
  return trimmedNotes.length > 0 ? `${base}\n\n${trimmedNotes}` : base;
}

export function boardStatusRollup(
  issue: { readonly id: string; readonly parentId: string | null },
  status: string,
): { readonly status: string; readonly text: string } | null {
  if (issue.parentId === null) return null;
  if (!BOARD_ROLLUP_STATUSES.has(status)) return null;
  return { status, text: `Dropped to ${status} from the board` };
}

export type BoardDispatchProgress = "starting" | "running" | "settled";

export function boardDispatchProgress(
  shell:
    | {
        readonly session: { readonly status: string } | null;
        readonly latestTurn: { readonly state: string } | null;
      }
    | null
    | undefined,
): BoardDispatchProgress {
  if (shell === undefined || shell === null) return "starting";
  const sessionStatus = shell.session?.status;
  if (sessionStatus === "starting" || sessionStatus === "running") return "running";
  if (shell.latestTurn?.state === "running") return "running";
  return "settled";
}
