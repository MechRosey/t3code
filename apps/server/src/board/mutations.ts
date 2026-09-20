import type { BoardIssue } from "./frontmatter.ts";
import { canonicalStatus, isKnownStatus, LINK_TYPES, type BoardLinkType } from "./vocabulary.ts";
import { resolveLinkId } from "./issues.ts";

export type BoardRuleFailure =
  | "invalid_status"
  | "invalid_link_type"
  | "open_children"
  | "subtree_open"
  | "no_parent";

export class BoardRuleError extends Error {
  readonly failure: BoardRuleFailure;

  constructor(failure: BoardRuleFailure, message: string) {
    super(message);
    this.failure = failure;
  }
}

const withUpdated = (issue: BoardIssue, now: string): BoardIssue => ({
  fm: { ...issue.fm, updated: now },
  body: issue.body,
});

export const applyStatus = (
  issue: BoardIssue,
  args: { status: string },
  now: string,
): BoardIssue => {
  if (!isKnownStatus(args.status)) {
    throw new BoardRuleError("invalid_status", `Invalid status '${args.status}'.`);
  }
  const next = withUpdated(issue, now);
  next.fm.status = canonicalStatus(args.status);
  return next;
};

export const assertStatusChildrenGuard = (
  targetStatus: string,
  directChildStatuses: readonly string[],
  force: boolean | undefined,
): void => {
  if (!["done", "cancelled"].includes(canonicalStatus(targetStatus))) return;
  if (force) return;
  const open = directChildStatuses.filter((status) => !["done", "cancelled"].includes(status));
  if (open.length > 0) {
    throw new BoardRuleError(
      "open_children",
      `Cannot set status to ${canonicalStatus(targetStatus)} - open children: ${open.join(", ")}`,
    );
  }
};

export const assertSubtreeClosed = (statuses: readonly string[]): void => {
  const open = statuses.filter((status) => !["done", "cancelled"].includes(status));
  if (open.length > 0) {
    throw new BoardRuleError("subtree_open", `Subtree has open issues: ${open.join(", ")}`);
  }
};

export const addLogEntry = (body: string, entry: string): string => {
  const trimmed = body.replace(/\s+$/, "");
  if (/^##\s+Log\s*$/m.test(trimmed)) {
    return `${trimmed}\n\n${entry}\n`;
  }
  return `${trimmed}\n\n## Log\n\n${entry}\n`;
};

export const applyComment = (
  issue: BoardIssue,
  args: { text: string; by?: string },
  stamp: string,
  now: string,
): BoardIssue => {
  const entry = args.by
    ? `- **${stamp}** [${args.by}] ${args.text}`
    : `- **${stamp}** ${args.text}`;
  return { fm: { ...withUpdated(issue, now).fm }, body: addLogEntry(issue.body, entry) };
};

export const applyTag = (
  issue: BoardIssue,
  args: { tag: string; remove?: boolean },
  now: string,
): BoardIssue => {
  const next = withUpdated(issue, now);
  if (args.remove) {
    next.fm.tags = next.fm.tags.filter((tag) => tag !== args.tag);
    return next;
  }
  if (!next.fm.tags.some((tag) => tag.toLowerCase() === args.tag.toLowerCase())) {
    next.fm.tags = [...next.fm.tags, args.tag];
  }
  return next;
};

export const applyLink = (
  issue: BoardIssue,
  args: { type: string; target: string; remove?: boolean },
  now: string,
  knownIds: readonly string[],
  canonicalTargetId: string | undefined,
): BoardIssue => {
  if (!(LINK_TYPES as readonly string[]).includes(args.type)) {
    throw new BoardRuleError(
      "invalid_link_type",
      `Invalid link type '${args.type}'. Allowed: ${LINK_TYPES.join(", ")}.`,
    );
  }
  const linkType = args.type as BoardLinkType;
  const next = withUpdated(issue, now);
  let existing = [...next.fm.links[linkType]];
  if (args.remove) {
    const resolvedTarget = resolveLinkId(args.target, knownIds);
    existing = existing.filter((ref) => resolveLinkId(ref, knownIds) !== resolvedTarget);
  } else {
    const resolvedTarget = resolveLinkId(args.target, knownIds);
    const resolvedExisting = existing.map((ref) => resolveLinkId(ref, knownIds));
    const alreadyLinked = resolvedExisting.some(
      (ref) => ref.toLowerCase() === resolvedTarget.toLowerCase(),
    );
    if (!alreadyLinked && canonicalTargetId !== undefined) {
      existing = [...existing, canonicalTargetId];
    }
  }
  next.fm.links = { ...next.fm.links, [linkType]: existing };
  return next;
};

const CHILD_RESOLUTIONS_HEADING = /^##\s+Child\s+resolutions\s*$/;
const ANY_HEADING = /^##\s/;

export const addChildResolution = (
  body: string,
  childId: string,
  childTitle: string,
  status: string,
  text: string,
): string => {
  const entry = `- child ${childId} (${childTitle}) ${status}: ${text}`;
  const escapedChildId = childId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const childPattern = new RegExp(`^- child ${escapedChildId}\\b`);
  const lines = body.split(/\r?\n/);
  const join = (parts: Array<string>): string => {
    const result = parts.join("\n");
    return result.endsWith("\n") ? result : `${result}\n`;
  };

  let childIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (CHILD_RESOLUTIONS_HEADING.test(lines[i] ?? "")) {
      childIdx = i;
      break;
    }
  }

  if (childIdx >= 0) {
    let endIdx = lines.length;
    for (let j = childIdx + 1; j < lines.length; j++) {
      if (ANY_HEADING.test(lines[j] ?? "")) {
        endIdx = j;
        break;
      }
    }
    let inserted = false;
    for (let k = childIdx + 1; k < endIdx; k++) {
      if (childPattern.test(lines[k] ?? "")) {
        lines[k] = entry;
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      lines.splice(endIdx, 0, entry);
    }
    return join(lines);
  }

  let logIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Log\s*$/.test(lines[i] ?? "")) {
      logIdx = i;
      break;
    }
  }

  if (logIdx >= 0) {
    const newLines = lines.slice(0, logIdx);
    if (newLines.length > 0 && newLines[newLines.length - 1] !== "") {
      newLines.push("");
    }
    newLines.push("## Child resolutions", entry, "");
    return join([...newLines, ...lines.slice(logIdx)]);
  }

  const trimmed = body.replace(/\s+$/, "");
  if (trimmed === "") {
    return join(["## Child resolutions", entry]);
  }
  const trimmedLines = trimmed.split(/\r?\n/);
  const newLines = [...trimmedLines];
  if (newLines.length > 0 && newLines[newLines.length - 1] !== "") {
    newLines.push("");
  }
  newLines.push("## Child resolutions", entry);
  return join(newLines);
};

export const applyRollup = (
  parent: BoardIssue,
  child: { id: string; title: string },
  args: { status: string; text: string },
  now: string,
): BoardIssue => {
  const next = withUpdated(parent, now);
  next.body = addChildResolution(parent.body, child.id, child.title, args.status, args.text);
  return next;
};
