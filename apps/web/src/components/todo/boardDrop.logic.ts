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
  if (targetStatus === "delegated") return { kind: "noop" };
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

export type BoardNewTaskHints = {
  readonly column?: string | null | undefined;
  readonly tag?: string | null | undefined;
};

export const BOARD_NEW_TASK_DISPATCH_KEY = "__new__";

const BOARD_NEW_TASK_TITLE_LIMIT = 60;

export function composeBoardNewTaskPrompt(
  ideaText: string,
  hints?: BoardNewTaskHints,
): string | null {
  const idea = ideaText.trim();
  if (idea.length === 0) return null;
  const hintLines: string[] = [];
  const column = hints?.column?.trim() ?? "";
  const tag = hints?.tag?.trim() ?? "";
  if (column.length > 0) hintLines.push(`column: ${column}`);
  if (tag.length > 0) hintLines.push(`tag: ${tag}`);
  const hintBlock = hintLines.length > 0 ? `\n\n${hintLines.join("\n")}` : "";
  return `/todo new\n\n${idea}${hintBlock}`;
}

export function composeBoardNewTaskTitle(ideaText: string): string {
  const idea = ideaText.replace(/\s+/g, " ").trim();
  if (idea.length === 0) return "todo new";
  return idea.slice(0, BOARD_NEW_TASK_TITLE_LIMIT);
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
