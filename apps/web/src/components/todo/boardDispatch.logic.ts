export const BOARD_DISPATCH_FAILURE_CODE = {
  inFlight: "in_flight",
  noProject: "no_project",
  noProvider: "no_provider",
  startFailed: "start_failed",
  emptyPrompt: "empty_prompt",
} as const;

export type BoardDispatchFailureCode =
  (typeof BOARD_DISPATCH_FAILURE_CODE)[keyof typeof BOARD_DISPATCH_FAILURE_CODE];

export interface BoardDispatchFailure {
  readonly status: "failed";
  readonly code: BoardDispatchFailureCode;
  readonly message: string;
}

export type BoardDispatchResult = { readonly status: "started" } | BoardDispatchFailure;

export interface BoardProjectCandidate {
  readonly id: string;
  readonly environmentId: string;
  readonly title: string;
  readonly workspaceRoot: string;
}

export interface BoardProjectOption {
  readonly id: string;
  readonly label: string;
  readonly path: string;
}

export interface BoardDispatchToast {
  readonly type: "error" | "info";
  readonly title: string;
  readonly description: string;
}

export const BOARD_DISPATCH_STARTED: BoardDispatchResult = { status: "started" };

const BOARD_DISPATCH_FAILURE_MESSAGE: Record<BoardDispatchFailureCode, string> = {
  [BOARD_DISPATCH_FAILURE_CODE.inFlight]:
    "Wait for the current dispatch to settle before running it again.",
  [BOARD_DISPATCH_FAILURE_CODE.noProject]: "No project matches the board's folder.",
  [BOARD_DISPATCH_FAILURE_CODE.noProvider]: "No provider is available to run the session.",
  [BOARD_DISPATCH_FAILURE_CODE.startFailed]: "The session did not start.",
  [BOARD_DISPATCH_FAILURE_CODE.emptyPrompt]: "Describe the task before dispatching.",
};

function hasText(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.length > 0;
}

export function createBoardDispatchFailure(
  code: BoardDispatchFailureCode,
  detail?: string | null,
): BoardDispatchFailure {
  const message =
    code === BOARD_DISPATCH_FAILURE_CODE.startFailed && hasText(detail)
      ? detail
      : BOARD_DISPATCH_FAILURE_MESSAGE[code];
  return { status: "failed", code, message };
}

export function boardStartFailure(cause: unknown): BoardDispatchFailure {
  const detail = cause instanceof Error ? cause.message : null;
  return createBoardDispatchFailure(BOARD_DISPATCH_FAILURE_CODE.startFailed, detail);
}

export function resolveBoardDispatchProject<P extends BoardProjectCandidate>(
  projects: ReadonlyArray<P>,
  target: {
    readonly environmentId: string;
    readonly cwd: string;
    readonly chosenProjectId: string | null;
  },
): P | null {
  const inEnvironment = projects.filter(
    (candidate) => candidate.environmentId === target.environmentId,
  );
  if (target.chosenProjectId !== null) {
    return inEnvironment.find((candidate) => candidate.id === target.chosenProjectId) ?? null;
  }
  return inEnvironment.find((candidate) => candidate.workspaceRoot === target.cwd) ?? null;
}

export function listBoardProjectOptions(
  projects: ReadonlyArray<BoardProjectCandidate>,
  environmentId: string,
): ReadonlyArray<BoardProjectOption> {
  return projects
    .filter((candidate) => candidate.environmentId === environmentId)
    .map((candidate) => ({
      id: candidate.id,
      label: candidate.title,
      path: candidate.workspaceRoot,
    }));
}

export function boardDispatchFailureLogFields(input: {
  readonly failure: BoardDispatchFailure;
  readonly cwd: string;
  readonly dispatchKey: string;
}): Record<string, string> {
  return { code: input.failure.code, cwd: input.cwd, dispatchKey: input.dispatchKey };
}

export function boardDispatchFailureToast(
  subject: string,
  failure: BoardDispatchFailure,
): BoardDispatchToast {
  if (failure.code === BOARD_DISPATCH_FAILURE_CODE.inFlight) {
    return { type: "info", title: `${subject} is already running`, description: failure.message };
  }
  return { type: "error", title: `Could not dispatch ${subject}`, description: failure.message };
}

export function shouldCloseAddTaskDialog(result: BoardDispatchResult): boolean {
  return result.status === "started";
}

export function shouldOfferProjectPicker(input: {
  readonly failure: BoardDispatchFailure | null;
  readonly chosenProjectId: string | null;
  readonly optionCount: number;
}): boolean {
  if (input.optionCount === 0) return false;
  if (input.chosenProjectId !== null) return true;
  return input.failure?.code === BOARD_DISPATCH_FAILURE_CODE.noProject;
}

export function isAddTaskSubmitDisabled(input: {
  readonly hasPrompt: boolean;
  readonly pending: boolean;
  readonly submitting: boolean;
  readonly pickerShown: boolean;
  readonly chosenProjectId: string | null;
}): boolean {
  if (!input.hasPrompt || input.pending || input.submitting) return true;
  return input.pickerShown && input.chosenProjectId === null;
}

export function shouldAutoCloseAddTask(input: {
  readonly wasBootstrap: boolean;
  readonly boardBootstrap: boolean;
  readonly hasSnapshot: boolean;
}): boolean {
  return input.wasBootstrap && !input.boardBootstrap && input.hasSnapshot;
}
