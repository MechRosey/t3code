import { buildTemporaryWorktreeBranchName } from "@t3tools/shared/git";
import { assert, describe, it } from "vite-plus/test";

import {
  type BoardAddAttempt,
  type BoardDispatchResult,
  BOARD_DISPATCH_FAILURE_CODE,
  BOARD_DISPATCH_STARTED,
  boardDispatchFailureLogFields,
  boardDispatchFailureToast,
  boardStartFailure,
  addAttemptFingerprint,
  createBoardDispatchFailure,
  isAddTaskDismissBlocked,
  isAddTaskSubmitDisabled,
  isDeliveryUnknownFailure,
  listBoardProjectOptions,
  recordAddAttemptOutcome,
  resolveBoardDispatchProject,
  resolveBoardDispatchTarget,
  runAddAttempt,
  selectAddAttemptIds,
  shouldAutoCloseAddTask,
  shouldCloseAddTaskDialog,
  shouldOfferProjectPicker,
} from "./boardDispatch.logic";

const BOARD_FOLDER = "C:\\repo\\board";
const SECRET_IDEA = "rotate the signing keys on friday";

function project(id: string, environmentId: string, workspaceRoot: string, title = id) {
  return { id, environmentId, workspaceRoot, title };
}

describe("createBoardDispatchFailure", () => {
  it("names the board folder problem for no_project", () => {
    const failure = createBoardDispatchFailure(BOARD_DISPATCH_FAILURE_CODE.noProject);

    assert.equal(failure.status, "failed");
    assert.equal(failure.code, "no_project");
    assert.equal(failure.message, "No project matches the board's folder.");
  });

  it("names the provider problem for no_provider", () => {
    const failure = createBoardDispatchFailure(BOARD_DISPATCH_FAILURE_CODE.noProvider);

    assert.equal(failure.message, "No provider is available to run the session.");
  });

  it("asks the caller to wait for in_flight", () => {
    const failure = createBoardDispatchFailure(BOARD_DISPATCH_FAILURE_CODE.inFlight);

    assert.equal(
      failure.message,
      "Wait for the current dispatch to settle before running it again.",
    );
  });

  it("asks for a description for empty_prompt", () => {
    const failure = createBoardDispatchFailure(BOARD_DISPATCH_FAILURE_CODE.emptyPrompt);

    assert.equal(failure.message, "Describe the task before dispatching.");
  });

  it("prefers the supplied detail for start_failed", () => {
    const failure = createBoardDispatchFailure(
      BOARD_DISPATCH_FAILURE_CODE.startFailed,
      "provider rejected the turn",
    );

    assert.equal(failure.message, "provider rejected the turn");
  });

  it("falls back to a default message for start_failed without detail", () => {
    assert.equal(
      createBoardDispatchFailure(BOARD_DISPATCH_FAILURE_CODE.startFailed).message,
      "The session did not start.",
    );
    assert.equal(
      createBoardDispatchFailure(BOARD_DISPATCH_FAILURE_CODE.startFailed, "").message,
      "The session did not start.",
    );
  });
});

describe("boardStartFailure", () => {
  it("uses the message of an Error cause", () => {
    const failure = boardStartFailure(new Error("socket closed"));

    assert.equal(failure.code, "start_failed");
    assert.equal(failure.message, "socket closed");
  });

  it("falls back to the default message for a non-Error cause", () => {
    const failure = boardStartFailure({ reason: "opaque" });

    assert.equal(failure.code, "start_failed");
    assert.equal(failure.message, "The session did not start.");
  });

  it("falls back to the default message for an Error with an empty message", () => {
    assert.equal(boardStartFailure(new Error("")).message, "The session did not start.");
  });
});

describe("resolveBoardDispatchProject", () => {
  const projects = [
    project("p-other-env", "env-b", BOARD_FOLDER),
    project("p-board", "env-a", BOARD_FOLDER),
    project("p-elsewhere", "env-a", "C:\\repo\\elsewhere"),
  ];

  it("matches the project whose root is the board folder in this environment", () => {
    const resolved = resolveBoardDispatchProject(projects, {
      environmentId: "env-a",
      cwd: BOARD_FOLDER,
      chosenProjectId: null,
    });

    assert.equal(resolved?.id, "p-board");
  });

  it("returns null when no project root matches the board folder", () => {
    const resolved = resolveBoardDispatchProject(projects, {
      environmentId: "env-a",
      cwd: "C:\\repo\\unknown",
      chosenProjectId: null,
    });

    assert.equal(resolved, null);
  });

  it("returns the chosen project even when its root is not the board folder", () => {
    const resolved = resolveBoardDispatchProject(projects, {
      environmentId: "env-a",
      cwd: "C:\\repo\\unknown",
      chosenProjectId: "p-elsewhere",
    });

    assert.equal(resolved?.id, "p-elsewhere");
  });

  it("prefers the chosen project over the cwd match", () => {
    const resolved = resolveBoardDispatchProject(projects, {
      environmentId: "env-a",
      cwd: BOARD_FOLDER,
      chosenProjectId: "p-elsewhere",
    });

    assert.equal(resolved?.id, "p-elsewhere");
  });

  it("ignores a chosen project from another environment", () => {
    const resolved = resolveBoardDispatchProject(projects, {
      environmentId: "env-a",
      cwd: "C:\\repo\\unknown",
      chosenProjectId: "p-other-env",
    });

    assert.equal(resolved, null);
  });

  it("returns null for a chosen project that no longer exists", () => {
    const resolved = resolveBoardDispatchProject(projects, {
      environmentId: "env-a",
      cwd: BOARD_FOLDER,
      chosenProjectId: "p-gone",
    });

    assert.equal(resolved, null);
  });

  it("returns null when there are no projects", () => {
    const resolved = resolveBoardDispatchProject([], {
      environmentId: "env-a",
      cwd: BOARD_FOLDER,
      chosenProjectId: null,
    });

    assert.equal(resolved, null);
  });
});

describe("resolveBoardDispatchTarget", () => {
  const WORKTREE = "C:\\repo\\board\\.worktrees\\feature";
  const projects = [
    project("p-other-env", "env-b", BOARD_FOLDER),
    project("p-board", "env-a", BOARD_FOLDER),
    project("p-elsewhere", "env-a", "C:\\repo\\elsewhere"),
  ];

  const FEATURE_BRANCH = "feature/board-dispatch";

  const resolve = (
    cwd: string,
    chosenProjectId: string | null,
    origin: { projectId: string; worktreePath: string | null; branch: string | null } | null,
  ) =>
    resolveBoardDispatchTarget(projects, { environmentId: "env-a", cwd, chosenProjectId, origin });

  it("prefers the chosen project, then the origin project, then the exact cwd match, and only the origin carries a branch", () => {
    const chosen = resolve(WORKTREE, "p-elsewhere", {
      projectId: "p-board",
      worktreePath: WORKTREE,
      branch: FEATURE_BRANCH,
    });
    const origin = resolve("C:\\repo\\elsewhere", null, {
      projectId: "p-board",
      worktreePath: null,
      branch: null,
    });
    const exactCwd = resolve(BOARD_FOLDER, null, null);

    assert.equal(chosen?.project.id, "p-elsewhere");
    assert.strictEqual(chosen?.worktreePath, null);
    assert.strictEqual(chosen?.branch, null);

    assert.equal(origin?.project.id, "p-board");
    assert.strictEqual(origin?.worktreePath, null);
    assert.strictEqual(origin?.branch, null);

    assert.equal(exactCwd?.project.id, "p-board");
    assert.strictEqual(exactCwd?.worktreePath, null);
    assert.strictEqual(exactCwd?.branch, null);
  });

  it("starts in the origin worktree on its branch only when the origin thread has a non-empty worktree", () => {
    const inWorktree = resolve(WORKTREE, null, {
      projectId: "p-board",
      worktreePath: WORKTREE,
      branch: FEATURE_BRANCH,
    });
    const detached = resolve(WORKTREE, null, {
      projectId: "p-board",
      worktreePath: WORKTREE,
      branch: null,
    });
    const atRoot = resolve(BOARD_FOLDER, null, {
      projectId: "p-board",
      worktreePath: null,
      branch: "main",
    });
    const emptyPath = resolve(BOARD_FOLDER, null, {
      projectId: "p-board",
      worktreePath: "",
      branch: "main",
    });

    assert.equal(inWorktree?.project.id, "p-board");
    assert.strictEqual(inWorktree?.worktreePath, WORKTREE);
    assert.strictEqual(inWorktree?.branch, FEATURE_BRANCH);

    assert.strictEqual(detached?.worktreePath, WORKTREE);
    assert.strictEqual(detached?.branch, null);

    assert.strictEqual(atRoot?.worktreePath, null);
    assert.strictEqual(atRoot?.branch, null);

    assert.equal(emptyPath?.project.id, "p-board");
    assert.strictEqual(emptyPath?.worktreePath, null);
    assert.strictEqual(emptyPath?.branch, null);
  });

  it("keeps the worktree but sends no branch when the origin branch is a temporary worktree name the server would rename", () => {
    const temporaryBranch = buildTemporaryWorktreeBranchName(() => "deadbeef");

    const temporary = resolve(WORKTREE, null, {
      projectId: "p-board",
      worktreePath: WORKTREE,
      branch: temporaryBranch,
    });
    const named = resolve(WORKTREE, null, {
      projectId: "p-board",
      worktreePath: WORKTREE,
      branch: FEATURE_BRANCH,
    });

    assert.strictEqual(temporary?.worktreePath, WORKTREE);
    assert.strictEqual(temporary?.branch, null);
    assert.strictEqual(named?.branch, FEATURE_BRANCH);
  });

  it("returns null for a missing or other-environment origin project instead of falling back to the cwd match", () => {
    const otherEnvironment = resolve(BOARD_FOLDER, null, {
      projectId: "p-other-env",
      worktreePath: null,
      branch: null,
    });
    const gone = resolve(BOARD_FOLDER, null, {
      projectId: "p-gone",
      worktreePath: WORKTREE,
      branch: FEATURE_BRANCH,
    });
    const noOriginNoRoot = resolve(WORKTREE, null, null);

    assert.equal(otherEnvironment, null);
    assert.equal(gone, null);
    assert.equal(noOriginNoRoot, null);
  });
});

describe("listBoardProjectOptions", () => {
  it("lists only the projects of the environment with name and path", () => {
    const options = listBoardProjectOptions(
      [
        project("p1", "env-a", "C:\\one", "One"),
        project("p2", "env-b", "C:\\two", "Two"),
        project("p3", "env-a", "C:\\three", "Three"),
      ],
      "env-a",
    );

    assert.deepEqual(options, [
      { id: "p1", label: "One", path: "C:\\one" },
      { id: "p3", label: "Three", path: "C:\\three" },
    ]);
  });

  it("returns nothing when the environment has no projects", () => {
    assert.deepEqual(listBoardProjectOptions([project("p1", "env-b", "C:\\one")], "env-a"), []);
  });
});

describe("boardDispatchFailureLogFields", () => {
  it("carries exactly the code, the board folder and the dispatch key", () => {
    const failure = createBoardDispatchFailure(BOARD_DISPATCH_FAILURE_CODE.noProject);

    const fields = boardDispatchFailureLogFields({
      failure,
      cwd: BOARD_FOLDER,
      dispatchKey: "__new__",
    });

    assert.deepEqual(fields, { code: "no_project", cwd: BOARD_FOLDER, dispatchKey: "__new__" });
  });

  it("never carries the failure message or submitted text", () => {
    const failure = boardStartFailure(new Error(`could not run: ${SECRET_IDEA}`));

    const fields = boardDispatchFailureLogFields({
      failure,
      cwd: BOARD_FOLDER,
      dispatchKey: "__new__",
    });

    assert.notInclude(JSON.stringify(fields), SECRET_IDEA);
    assert.deepEqual(Object.keys(fields).sort(), ["code", "cwd", "dispatchKey"]);
  });
});

describe("boardDispatchFailureToast", () => {
  it("reports an error titled with the subject for no_project", () => {
    const toast = boardDispatchFailureToast(
      "the new task",
      createBoardDispatchFailure(BOARD_DISPATCH_FAILURE_CODE.noProject),
    );

    assert.deepEqual(toast, {
      type: "error",
      title: "Could not dispatch the new task",
      description: "No project matches the board's folder.",
    });
  });

  it("reports in_flight as an info toast about the subject", () => {
    const toast = boardDispatchFailureToast(
      "t-12",
      createBoardDispatchFailure(BOARD_DISPATCH_FAILURE_CODE.inFlight),
    );

    assert.deepEqual(toast, {
      type: "info",
      title: "t-12 is already running",
      description: "Wait for the current dispatch to settle before running it again.",
    });
  });

  it("uses the start failure detail as the description", () => {
    const toast = boardDispatchFailureToast("t-12", boardStartFailure(new Error("socket closed")));

    assert.equal(toast.type, "error");
    assert.equal(toast.title, "Could not dispatch t-12");
    assert.equal(toast.description, "socket closed");
  });
});

describe("shouldCloseAddTaskDialog", () => {
  it("closes after a started dispatch", () => {
    assert.equal(shouldCloseAddTaskDialog(BOARD_DISPATCH_STARTED), true);
  });

  it("stays open after every failure code", () => {
    for (const code of Object.values(BOARD_DISPATCH_FAILURE_CODE)) {
      assert.equal(shouldCloseAddTaskDialog(createBoardDispatchFailure(code)), false, code);
    }
  });
});

describe("shouldOfferProjectPicker", () => {
  const noProject = () => createBoardDispatchFailure(BOARD_DISPATCH_FAILURE_CODE.noProject);
  const noProvider = () => createBoardDispatchFailure(BOARD_DISPATCH_FAILURE_CODE.noProvider);

  it("offers the picker after a no_project failure with projects to choose from", () => {
    assert.equal(
      shouldOfferProjectPicker({ failure: noProject(), chosenProjectId: null, optionCount: 2 }),
      true,
    );
  });

  it("withholds the picker when there are no projects to choose from", () => {
    assert.equal(
      shouldOfferProjectPicker({ failure: noProject(), chosenProjectId: null, optionCount: 0 }),
      false,
    );
  });

  it("withholds the picker before any failure", () => {
    assert.equal(
      shouldOfferProjectPicker({ failure: null, chosenProjectId: null, optionCount: 2 }),
      false,
    );
  });

  it("withholds the picker for failures it cannot fix", () => {
    assert.equal(
      shouldOfferProjectPicker({ failure: noProvider(), chosenProjectId: null, optionCount: 2 }),
      false,
    );
  });

  it("keeps the picker once a project was chosen", () => {
    assert.equal(
      shouldOfferProjectPicker({ failure: noProvider(), chosenProjectId: "p1", optionCount: 2 }),
      true,
    );
  });
});

describe("isAddTaskSubmitDisabled", () => {
  const ready = {
    hasPrompt: true,
    pending: false,
    submitting: false,
    pickerShown: false,
    chosenProjectId: null,
  };

  it("enables dispatch for a described task", () => {
    assert.equal(isAddTaskSubmitDisabled(ready), false);
  });

  it("disables dispatch without a prompt", () => {
    assert.equal(isAddTaskSubmitDisabled({ ...ready, hasPrompt: false }), true);
  });

  it("disables dispatch while a new task is already running", () => {
    assert.equal(isAddTaskSubmitDisabled({ ...ready, pending: true }), true);
  });

  it("disables dispatch while a submit is in flight", () => {
    assert.equal(isAddTaskSubmitDisabled({ ...ready, submitting: true }), true);
  });

  it("disables dispatch while the picker waits for a choice", () => {
    assert.equal(isAddTaskSubmitDisabled({ ...ready, pickerShown: true }), true);
  });

  it("enables dispatch once the picker has a choice", () => {
    assert.equal(
      isAddTaskSubmitDisabled({ ...ready, pickerShown: true, chosenProjectId: "p1" }),
      false,
    );
  });
});

describe("isAddTaskDismissBlocked", () => {
  it("blocks dismissal while a submit is in flight and allows it otherwise", () => {
    assert.equal(isAddTaskDismissBlocked(true), true);
    assert.equal(isAddTaskDismissBlocked(false), false);
  });
});

describe("shouldAutoCloseAddTask", () => {
  it("closes when the board leaves bootstrap and a snapshot arrives", () => {
    assert.equal(
      shouldAutoCloseAddTask({ wasBootstrap: true, boardBootstrap: false, hasSnapshot: true }),
      true,
    );
  });

  it("stays open on ordinary snapshot updates of an existing board", () => {
    assert.equal(
      shouldAutoCloseAddTask({ wasBootstrap: false, boardBootstrap: false, hasSnapshot: true }),
      false,
    );
  });

  it("stays open while the board is still bootstrapping", () => {
    assert.equal(
      shouldAutoCloseAddTask({ wasBootstrap: true, boardBootstrap: true, hasSnapshot: false }),
      false,
    );
  });

  it("stays open when bootstrap ended without a snapshot", () => {
    assert.equal(
      shouldAutoCloseAddTask({ wasBootstrap: true, boardBootstrap: false, hasSnapshot: false }),
      false,
    );
  });
});

describe("isDeliveryUnknownFailure", () => {
  it("is unknown only for an interrupt or a dropped rpc client and fails closed for everything else", () => {
    const launchError = { _tag: "OrchestrationV2ThreadLaunchError", message: "Failed to launch" };
    const neverSent = { _tag: "EnvironmentRpcUnavailableError", message: "no connection" };
    const droppedClient = { _tag: "RpcClientError", message: "socket closed" };
    const classify = (cause: unknown, interrupted = false) =>
      isDeliveryUnknownFailure({ cause, interrupted });

    assert.equal(classify(new Error("x"), true), true);
    assert.equal(classify(undefined, true), true);
    assert.equal(classify(droppedClient), true);

    assert.equal(classify(launchError), false);
    assert.equal(classify(neverSent), false);
    assert.equal(classify(new Error("boom")), false);
    assert.equal(classify(undefined), false);
    assert.equal(classify(null), false);
    assert.equal(classify("RpcClientError"), false);
    assert.equal(classify({ _tag: 7 }), false);
  });
});

describe("start failure delivery flag", () => {
  it("is carried by start failures and is never set on any other failure code", () => {
    const dropped = boardStartFailure({ _tag: "RpcClientError" });
    const interrupted = boardStartFailure(new Error("interrupted"), true);
    const definitive = boardStartFailure(new Error("provider rejected"));

    assert.equal(dropped.code, BOARD_DISPATCH_FAILURE_CODE.startFailed);
    assert.equal(dropped.deliveryUnknown, true);
    assert.equal(interrupted.deliveryUnknown, true);
    assert.equal(definitive.deliveryUnknown, false);
    for (const code of Object.values(BOARD_DISPATCH_FAILURE_CODE)) {
      assert.equal(createBoardDispatchFailure(code).deliveryUnknown, false, code);
    }
  });
});

describe("addAttemptFingerprint", () => {
  it("is stable for the same prompt and project and changes with either one", () => {
    const base = addAttemptFingerprint({ prompt: "/todo new\n\nfix it", projectId: "p1" });

    assert.equal(base, addAttemptFingerprint({ prompt: "/todo new\n\nfix it", projectId: "p1" }));
    assert.notEqual(
      base,
      addAttemptFingerprint({ prompt: "/todo new\n\nfix it now", projectId: "p1" }),
    );
    assert.notEqual(
      base,
      addAttemptFingerprint({ prompt: "/todo new\n\nfix it", projectId: "p2" }),
    );
    assert.notEqual(
      base,
      addAttemptFingerprint({ prompt: "/todo new\n\nfix it", projectId: null }),
    );
    assert.notEqual(
      addAttemptFingerprint({ prompt: "a", projectId: "bc" }),
      addAttemptFingerprint({ prompt: "ab", projectId: "c" }),
    );
  });
});

describe("selectAddAttemptIds", () => {
  const FINGERPRINT = "fingerprint-a";
  const OTHER_FINGERPRINT = "fingerprint-b";
  const previous = (deliveryUnknown: boolean) => ({
    fingerprint: FINGERPRINT,
    commandId: "cmd-old",
    messageId: "msg-old",
    deliveryUnknown,
  });
  const countingMint = () => {
    let calls = 0;
    return {
      mint: () => {
        calls += 1;
        return { commandId: `cmd-new-${calls}`, messageId: `msg-new-${calls}` };
      },
      calls: () => calls,
    };
  };

  it("mints once when there is no previous attempt", () => {
    const minter = countingMint();

    const ids = selectAddAttemptIds(null, FINGERPRINT, minter.mint);

    assert.deepEqual(ids, { commandId: "cmd-new-1", messageId: "msg-new-1" });
    assert.equal(minter.calls(), 1);
  });

  it("reuses both ids without minting when delivery was unknown and the text is unchanged", () => {
    const minter = countingMint();

    const ids = selectAddAttemptIds(previous(true), FINGERPRINT, minter.mint);

    assert.deepEqual(ids, { commandId: "cmd-old", messageId: "msg-old" });
    assert.equal(minter.calls(), 0);
  });

  it("re-mints both ids after a definitive failure so a stored rejection is never replayed", () => {
    const minter = countingMint();

    const ids = selectAddAttemptIds(previous(false), FINGERPRINT, minter.mint);

    assert.deepEqual(ids, { commandId: "cmd-new-1", messageId: "msg-new-1" });
  });

  it("re-mints both ids when the text changed after an unknown delivery", () => {
    const minter = countingMint();

    const ids = selectAddAttemptIds(previous(true), OTHER_FINGERPRINT, minter.mint);

    assert.deepEqual(ids, { commandId: "cmd-new-1", messageId: "msg-new-1" });
  });
});

describe("recordAddAttemptOutcome", () => {
  const used = { fingerprint: "fp", commandId: "cmd-1", messageId: "msg-1" };
  const earlier = {
    fingerprint: "fp-earlier",
    commandId: "cmd-0",
    messageId: "msg-0",
    deliveryUnknown: true,
  };

  it("records an unknown delivery so the next retry can reuse the ids", () => {
    const failure = boardStartFailure({ _tag: "RpcClientError" }, false);

    const recorded = recordAddAttemptOutcome({ previous: null, used, failure });

    assert.deepEqual(recorded, { ...used, deliveryUnknown: true });
  });

  it("records a definitive failure as not unknown, replacing the earlier attempt", () => {
    const failure = boardStartFailure(new Error("provider rejected"));

    const recorded = recordAddAttemptOutcome({ previous: earlier, used, failure });

    assert.deepEqual(recorded, { ...used, deliveryUnknown: false });
  });

  it("keeps the earlier attempt when the failure made no request", () => {
    const clientSideCodes = [
      BOARD_DISPATCH_FAILURE_CODE.noProject,
      BOARD_DISPATCH_FAILURE_CODE.noProvider,
      BOARD_DISPATCH_FAILURE_CODE.inFlight,
      BOARD_DISPATCH_FAILURE_CODE.emptyPrompt,
    ];

    for (const code of clientSideCodes) {
      const failure = createBoardDispatchFailure(code);

      assert.equal(recordAddAttemptOutcome({ previous: earlier, used, failure }), earlier, code);
      assert.equal(recordAddAttemptOutcome({ previous: null, used, failure }), null, code);
    }
  });
});

describe("runAddAttempt", () => {
  const PROMPT = "/todo new\n\nrotate the signing keys";
  const lostResponse = () => boardStartFailure({ _tag: "RpcClientError" });
  const rejected = () => boardStartFailure(new Error("provider rejected"));
  const noProject = () => createBoardDispatchFailure(BOARD_DISPATCH_FAILURE_CODE.noProject);

  function addAttemptRig(results: ReadonlyArray<BoardDispatchResult>) {
    let minted = 0;
    const sent: Array<{ commandId: string; messageId: string }> = [];
    return {
      sent,
      mintedCount: () => minted,
      mint: () => {
        minted += 1;
        return { commandId: `cmd-${minted}`, messageId: `msg-${minted}` };
      },
      send: async (ids: { commandId: string; messageId: string }) => {
        sent.push(ids);
        return results[sent.length - 1] ?? BOARD_DISPATCH_STARTED;
      },
    };
  }

  it("replays the same id pair after a lost response and re-mints both after a definitive failure", async () => {
    const rig = addAttemptRig([lostResponse(), rejected(), BOARD_DISPATCH_STARTED]);
    const submit = (previous: BoardAddAttempt<string, string> | null) =>
      runAddAttempt({ previous, prompt: PROMPT, projectId: "p1", mint: rig.mint, send: rig.send });

    const first = await submit(null);
    const second = await submit(first.attempt);
    const third = await submit(second.attempt);

    assert.deepEqual(rig.sent, [
      { commandId: "cmd-1", messageId: "msg-1" },
      { commandId: "cmd-1", messageId: "msg-1" },
      { commandId: "cmd-2", messageId: "msg-2" },
    ]);
    assert.equal(rig.mintedCount(), 2);
    assert.equal(first.attempt?.deliveryUnknown, true);
    assert.equal(second.attempt?.deliveryUnknown, false);
    assert.equal(third.result.status, "started");
  });

  it("leaves the earlier record untouched when a client-side failure falls between two requests", async () => {
    const rig = addAttemptRig([lostResponse(), noProject(), BOARD_DISPATCH_STARTED]);
    const submit = (previous: BoardAddAttempt<string, string> | null) =>
      runAddAttempt({ previous, prompt: PROMPT, projectId: "p1", mint: rig.mint, send: rig.send });

    const first = await submit(null);
    const clientSide = await submit(first.attempt);
    const retry = await submit(clientSide.attempt);

    assert.equal(clientSide.result.status, "failed");
    assert.equal(clientSide.attempt, first.attempt);
    assert.deepEqual(rig.sent, [
      { commandId: "cmd-1", messageId: "msg-1" },
      { commandId: "cmd-1", messageId: "msg-1" },
      { commandId: "cmd-1", messageId: "msg-1" },
    ]);
    assert.equal(rig.mintedCount(), 1);
    assert.equal(retry.result.status, "started");
  });

  it("returns the started result without needing a record", async () => {
    const rig = addAttemptRig([BOARD_DISPATCH_STARTED]);

    const outcome = await runAddAttempt({
      previous: null,
      prompt: PROMPT,
      projectId: null,
      mint: rig.mint,
      send: rig.send,
    });

    assert.equal(outcome.result, BOARD_DISPATCH_STARTED);
    assert.equal(outcome.attempt, null);
    assert.deepEqual(rig.sent, [{ commandId: "cmd-1", messageId: "msg-1" }]);
  });

  it("re-mints both ids when the text or the project changes after a lost response", async () => {
    const rig = addAttemptRig([lostResponse(), lostResponse(), lostResponse(), lostResponse()]);
    const submit = (
      previous: BoardAddAttempt<string, string> | null,
      prompt: string,
      projectId: string | null,
    ) => runAddAttempt({ previous, prompt, projectId, mint: rig.mint, send: rig.send });

    const first = await submit(null, PROMPT, "p1");
    const edited = await submit(first.attempt, `${PROMPT} today`, "p1");
    const moved = await submit(edited.attempt, `${PROMPT} today`, "p2");
    await submit(moved.attempt, `${PROMPT} today`, "p2");

    assert.deepEqual(rig.sent, [
      { commandId: "cmd-1", messageId: "msg-1" },
      { commandId: "cmd-2", messageId: "msg-2" },
      { commandId: "cmd-3", messageId: "msg-3" },
      { commandId: "cmd-3", messageId: "msg-3" },
    ]);
    assert.equal(rig.mintedCount(), 3);
  });
});
