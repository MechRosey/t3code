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

export function createBoardDispatchFailure(
  _code: BoardDispatchFailureCode,
  _detail?: string | null,
): BoardDispatchFailure {
  throw new Error("not implemented");
}

export function boardStartFailure(_cause: unknown): BoardDispatchFailure {
  throw new Error("not implemented");
}

export function resolveBoardDispatchProject<P extends BoardProjectCandidate>(
  _projects: ReadonlyArray<P>,
  _target: {
    readonly environmentId: string;
    readonly cwd: string;
    readonly chosenProjectId: string | null;
  },
): P | null {
  throw new Error("not implemented");
}

export function listBoardProjectOptions(
  _projects: ReadonlyArray<BoardProjectCandidate>,
  _environmentId: string,
): ReadonlyArray<BoardProjectOption> {
  throw new Error("not implemented");
}

export function boardDispatchFailureLogFields(_input: {
  readonly failure: BoardDispatchFailure;
  readonly cwd: string;
  readonly dispatchKey: string;
}): Record<string, string> {
  throw new Error("not implemented");
}

export function boardDispatchFailureToast(
  _subject: string,
  _failure: BoardDispatchFailure,
): BoardDispatchToast {
  throw new Error("not implemented");
}

export function shouldCloseAddTaskDialog(_result: BoardDispatchResult): boolean {
  throw new Error("not implemented");
}

export function shouldOfferProjectPicker(_input: {
  readonly failure: BoardDispatchFailure | null;
  readonly chosenProjectId: string | null;
  readonly optionCount: number;
}): boolean {
  throw new Error("not implemented");
}

export function isAddTaskSubmitDisabled(_input: {
  readonly hasPrompt: boolean;
  readonly pending: boolean;
  readonly submitting: boolean;
  readonly pickerShown: boolean;
  readonly chosenProjectId: string | null;
}): boolean {
  throw new Error("not implemented");
}

export function shouldAutoCloseAddTask(_input: {
  readonly wasBootstrap: boolean;
  readonly boardBootstrap: boolean;
  readonly hasSnapshot: boolean;
}): boolean {
  throw new Error("not implemented");
}
