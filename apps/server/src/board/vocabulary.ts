export const BOARD_STATUSES = ["backlog", "doing", "read", "blocked", "done", "cancelled"] as const;

export type BoardStatus = (typeof BOARD_STATUSES)[number];

const STATUS_ALIASES: Readonly<Record<string, BoardStatus>> = {
  do: "doing",
  start: "doing",
  "in progress": "read",
};

export const LINK_TYPES = ["blocks", "relates"] as const;

export type BoardLinkType = (typeof LINK_TYPES)[number];

const knownStatus = (value: string): BoardStatus | undefined => {
  if ((BOARD_STATUSES as readonly string[]).includes(value)) {
    return value as BoardStatus;
  }
  return STATUS_ALIASES[value.toLowerCase()];
};

export const canonicalStatus = (status: string): string => knownStatus(status) ?? status;

export const isKnownStatus = (value: string): value is BoardStatus =>
  knownStatus(value) !== undefined;
