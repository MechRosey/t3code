import { TodoBoardError, type EnvironmentId, type TodoIssue } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import * as Schema from "effect/Schema";
import { EllipsisIcon } from "lucide-react";
import { useMemo } from "react";

import { todoBoardMutate } from "../../state/todoBoard";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "../ui/menu";
import { toastManager } from "../ui/toast";
import { boardArchiveEligibleSubtrees, boardArchiveSweepCandidates } from "./boardView.logic";

const isTodoBoardError = Schema.is(TodoBoardError);

export interface BoardOverflowMenuProps {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly issues: ReadonlyArray<TodoIssue>;
}

export function BoardOverflowMenu({ environmentId, cwd, issues }: BoardOverflowMenuProps) {
  const mutate = useAtomCommand(todoBoardMutate, { reportFailure: false });
  const eligibleSubtrees = useMemo(() => boardArchiveEligibleSubtrees(issues), [issues]);
  const sweepCandidates = useMemo(() => boardArchiveSweepCandidates(issues), [issues]);

  const toastArchiveFailure = (issue: TodoIssue, failure: unknown) => {
    toastManager.add({
      type: "error",
      title: `Could not archive ${issue.id}`,
      description:
        failure instanceof Error && failure.message.length > 0
          ? failure.message
          : "The board rejected the archive.",
    });
  };

  const archiveSubtree = async (issue: TodoIssue) => {
    const result = await mutate({
      environmentId,
      input: { action: "archive", cwd, id: issue.id },
    });
    if (result._tag !== "Failure") return;
    toastArchiveFailure(issue, squashAtomCommandFailure(result));
  };

  const archiveFinished = async () => {
    const candidates = [...sweepCandidates];
    let archived = 0;
    for (const candidate of candidates) {
      const result = await mutate({
        environmentId,
        input: { action: "archive", cwd, id: candidate.id },
      });
      if (result._tag !== "Failure") {
        archived += 1;
        continue;
      }
      const failure = squashAtomCommandFailure(result);
      if (isTodoBoardError(failure) && failure.failure === "issue_not_found") continue;
      toastArchiveFailure(candidate, failure);
    }
    if (archived > 0) {
      toastManager.add({
        type: "success",
        title: `Archived ${archived} finished ${archived === 1 ? "subtree" : "subtrees"}`,
      });
    }
  };

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button size="icon-sm" variant="ghost-muted" aria-label="Board archive actions">
            <EllipsisIcon className="size-4" />
          </Button>
        }
      />
      <MenuPopup align="end" className="min-w-48">
        <MenuItem disabled={sweepCandidates.length === 0} onClick={() => void archiveFinished()}>
          Archive finished
        </MenuItem>
        <MenuSub>
          <MenuSubTrigger>Archive subtree...</MenuSubTrigger>
          <MenuSubPopup className="max-w-64">
            {eligibleSubtrees.length === 0 ? (
              <MenuItem disabled>No finished subtrees</MenuItem>
            ) : (
              eligibleSubtrees.map((issue) => (
                <MenuItem key={issue.id} onClick={() => void archiveSubtree(issue)}>
                  <span className="min-w-0 truncate">
                    {issue.id} {issue.title}
                  </span>
                </MenuItem>
              ))
            )}
          </MenuSubPopup>
        </MenuSub>
        <MenuSeparator />
        <MenuItem disabled>Regenerate board.html</MenuItem>
        <MenuItem disabled>Rebuild INDEX.md</MenuItem>
      </MenuPopup>
    </Menu>
  );
}
