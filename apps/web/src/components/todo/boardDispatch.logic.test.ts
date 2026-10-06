import { assert, describe, it } from "vite-plus/test";

import {
  BOARD_DISPATCH_FAILURE_CODE,
  BOARD_DISPATCH_STARTED,
  boardDispatchFailureLogFields,
  boardDispatchFailureToast,
  boardStartFailure,
  createBoardDispatchFailure,
  isAddTaskDismissBlocked,
  isAddTaskSubmitDisabled,
  listBoardProjectOptions,
  resolveBoardDispatchProject,
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
