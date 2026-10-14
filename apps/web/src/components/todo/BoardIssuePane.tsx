import type { TodoIssue } from "@t3tools/contracts";
import {
  boardStatusColourClass,
  boardStatusLabel,
} from "@t3tools/client-runtime/state/todo-board-view";
import { GitCompareIcon, PlusIcon, XIcon, ZapIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Menu,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { ScrollArea } from "../ui/scroll-area";
import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { CopyIssueIdButton } from "./BoardCard";
import { shortBoardId } from "./boardCopy.logic";
import type { BoardDropActionMode } from "./boardDrop.logic";
import { BoardMarkdown } from "./BoardMarkdown";
import { BoardPaneHeader } from "./BoardSplitLayout";
import type { BoardSplitMode } from "./boardSplit.logic";
import type { BoardDrawerMode } from "./boardUiState";
import {
  DEFAULT_COMMENT_ACTOR,
  prepareCommentActor,
  prepareCommentText,
} from "./commentForm.logic";
import type { FocusGraph } from "./mapView.logic";
import { MapView } from "./MapView";
import { normalizeTagInput, unusedBoardTags } from "./tagForm.logic";

export function BoardIssuePane({
  issue,
  splitMode,
  drawerMode,
  statusOptions,
  boardTags,
  dispatchInFlight,
  viewDiff,
  focusGraph,
  onFocusIssue,
  onDrawerModeChange,
  onStatusChange,
  onDispatch,
  onComment,
  onTagAdd,
  onTagRemove,
  onViewDiff,
  onClose,
}: {
  readonly issue: TodoIssue;
  readonly splitMode: BoardSplitMode;
  readonly drawerMode: BoardDrawerMode;
  readonly statusOptions: ReadonlyArray<string>;
  readonly boardTags: ReadonlyArray<string>;
  readonly dispatchInFlight: boolean;
  readonly viewDiff: { readonly threadMissing: boolean } | null;
  readonly focusGraph: FocusGraph | null;
  readonly onFocusIssue: (issueId: string) => void;
  readonly onDrawerModeChange: (mode: BoardDrawerMode) => void;
  readonly onStatusChange: (issue: TodoIssue, status: string) => void;
  readonly onDispatch: (issue: TodoIssue, mode: BoardDropActionMode) => void;
  readonly onComment: (issue: TodoIssue, text: string, by: string | undefined) => Promise<boolean>;
  readonly onTagAdd: (issue: TodoIssue, tag: string) => void;
  readonly onTagRemove: (issue: TodoIssue, tag: string) => void;
  readonly onViewDiff: () => void;
  readonly onClose: () => void;
}) {
  const [commentText, setCommentText] = useState("");
  const [commentActor, setCommentActor] = useState(DEFAULT_COMMENT_ACTOR);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [newTagText, setNewTagText] = useState("");
  const preparedComment = prepareCommentText(commentText);
  const preparedTag = normalizeTagInput(newTagText, issue.tags);
  const tagSuggestions = useMemo(
    () => unusedBoardTags(boardTags, issue.tags),
    [boardTags, issue.tags],
  );
  const submitComment = async () => {
    const text = preparedComment;
    if (text === null || submittingComment) return;
    setSubmittingComment(true);
    const succeeded = await onComment(issue, text, prepareCommentActor(commentActor));
    setSubmittingComment(false);
    if (succeeded) setCommentText("");
  };
  const submitNewTag = () => {
    const prepared = preparedTag;
    if (prepared === null) return;
    onTagAdd(issue, prepared.tag);
    setNewTagText("");
  };
  return (
    <>
      <BoardPaneHeader
        splitMode={splitMode}
        drawerMode={drawerMode}
        onDrawerModeChange={onDrawerModeChange}
        backLabel="Board"
        backAriaLabel="Back to the board"
        onClose={onClose}
        tools={<CopyIssueIdButton issue={issue} />}
        title={issue.title}
        description={`${shortBoardId(issue.id)} - ${boardStatusLabel(issue.status)}`}
      />
      <ScrollArea scrollFade className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
          {focusGraph !== null && focusGraph.nodes.length > 0 ? (
            <MapView graph={focusGraph} onFocusIssue={onFocusIssue} />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Menu>
              <MenuTrigger
                render={
                  <Button size="compact" variant="outline" aria-label="Change status">
                    {boardStatusLabel(issue.status)}
                  </Button>
                }
              />
              <MenuPopup align="start" className="min-w-40">
                <MenuRadioGroup
                  value={issue.status}
                  onValueChange={(next) => onStatusChange(issue, next as string)}
                >
                  {statusOptions.map((status) => (
                    <MenuRadioItem key={status} value={status}>
                      <span className={boardStatusColourClass(status)}>
                        {boardStatusLabel(status)}
                      </span>
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              </MenuPopup>
            </Menu>
            <Button
              size="compact"
              variant="outline"
              disabled={dispatchInFlight}
              aria-label={`Dispatch todo -read ${issue.id}`}
              onClick={() => onDispatch(issue, "read")}
            >
              <ZapIcon className="size-3" />
              Read
            </Button>
            <Button
              size="compact"
              variant="outline"
              disabled={dispatchInFlight}
              aria-label={`Dispatch todo -do ${issue.id}`}
              onClick={() => onDispatch(issue, "doing")}
            >
              <ZapIcon className="size-3" />
              Do
            </Button>
            {viewDiff !== null ? (
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex" />}>
                  <Button
                    size="compact"
                    variant="outline"
                    disabled={viewDiff.threadMissing}
                    aria-label="View the diff of the thread recorded for this ticket"
                    onClick={onViewDiff}
                  >
                    <GitCompareIcon className="size-3" />
                    View diff
                  </Button>
                </TooltipTrigger>
                <TooltipPopup>
                  {viewDiff.threadMissing
                    ? "The recorded thread is gone"
                    : "Open the recorded thread's diff"}
                </TooltipPopup>
              </Tooltip>
            ) : null}
            {issue.tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-0.5 rounded-sm bg-muted py-0.5 ps-1.5 pe-1 font-mono text-3xs text-muted-foreground"
              >
                {tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  className="cursor-pointer rounded-sm text-muted-foreground/50 outline-none hover:text-foreground focus-visible:text-foreground"
                  onClick={() => onTagRemove(issue, tag)}
                >
                  <XIcon className="size-2.5" />
                </button>
              </span>
            ))}
            <Menu>
              <MenuTrigger
                render={
                  <Button size="compact" variant="ghost-muted" aria-label="Add a tag">
                    <PlusIcon className="size-3" />
                    <span>Add tag</span>
                  </Button>
                }
              />
              <MenuPopup align="start" className="min-w-40">
                {tagSuggestions.length > 0 ? (
                  tagSuggestions.map((tag) => (
                    <MenuItem key={tag} onClick={() => onTagAdd(issue, tag)}>
                      {tag}
                    </MenuItem>
                  ))
                ) : (
                  <MenuGroupLabel>No unused board tags</MenuGroupLabel>
                )}
                <MenuSeparator />
                <div
                  className="flex items-center gap-1 p-1"
                  onKeyDown={(event) => {
                    if (event.key !== "Escape") {
                      event.stopPropagation();
                    }
                  }}
                >
                  <Input
                    size="compact"
                    className="flex-1"
                    placeholder="New tag"
                    aria-label="New tag"
                    value={newTagText}
                    onChange={(event) => setNewTagText(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        submitNewTag();
                      }
                    }}
                  />
                  <Button size="compact" disabled={preparedTag === null} onClick={submitNewTag}>
                    Add
                  </Button>
                </div>
              </MenuPopup>
            </Menu>
          </div>
          {issue.body.trim().length > 0 ? <BoardMarkdown body={issue.body} /> : null}
          <div className="flex flex-col gap-2">
            <Textarea
              size="sm"
              placeholder="Add a comment to the ticket log"
              aria-label="Comment text"
              value={commentText}
              onChange={(event) => setCommentText(event.currentTarget.value)}
            />
            <div className="flex items-center gap-2">
              <Input
                size="compact"
                className="flex-1"
                placeholder="Commenting as"
                aria-label="Commenting as"
                value={commentActor}
                onChange={(event) => setCommentActor(event.currentTarget.value)}
              />
              <Button
                size="compact"
                variant="outline"
                disabled={preparedComment === null || submittingComment}
                onClick={() => void submitComment()}
              >
                Comment
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span>created {issue.created}</span>
            <span>updated {issue.updated}</span>
            <span className="truncate font-mono">{issue.markerPath}</span>
          </div>
        </div>
      </ScrollArea>
    </>
  );
}
