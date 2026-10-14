import { canonicalStatus, LINK_TYPES, type BoardLinkType } from "./vocabulary.ts";

export interface BoardIssueLinks {
  blocks: Array<string>;
  relates: Array<string>;
}

export interface BoardIssueFm {
  id: string;
  title: string;
  status: string;
  created: string;
  updated: string;
  colour: string | undefined;
  epic: string | undefined;
  tags: Array<string>;
  links: BoardIssueLinks;
}

export interface BoardIssue {
  fm: BoardIssueFm;
  body: string;
}

const BOM = "\uFEFF";

export const splitLines = (text: string): Array<string> => {
  if (text === "") return [];
  const parts = text.split(/\r\n|\n|\r/);
  if (/(?:\r\n|\n|\r)$/.test(text)) parts.pop();
  return parts;
};

const trimmedOfBom = (line: string): string => line.split(BOM).join("").trim();

export const toYamlList = (items: readonly string[]): string => {
  if (items.length === 0) return "[]";
  return `[${items.join(", ")}]`;
};

export const fromYamlList = (raw: string): Array<string> => {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "[]") return [];
  const inner = trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;
  return inner
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
};

export const parseIssue = (text: string, dirName: string): BoardIssue => {
  const stripped = text.startsWith(BOM) ? text.slice(1) : text;
  const lines = splitLines(stripped);
  const fm: BoardIssueFm = {
    id: dirName,
    title: dirName,
    status: "backlog",
    created: "",
    updated: "",
    colour: undefined,
    epic: undefined,
    tags: [],
    links: { blocks: [], relates: [] },
  };
  const bodyLines: Array<string> = [];
  let state: "pre" | "fm" | "body" = "pre";
  let inLinks = false;
  for (const line of lines) {
    const fence = trimmedOfBom(line);
    if (state === "pre") {
      if (fence === "---") state = "fm";
      continue;
    }
    if (state === "fm") {
      if (fence === "---") {
        state = "body";
        continue;
      }
      if (inLinks) {
        const sub = /^\s+([A-Za-z]+):\s*(.*)$/.exec(line);
        if (sub) {
          const key = (sub[1] ?? "") as BoardLinkType;
          if ((LINK_TYPES as readonly string[]).includes(key)) {
            fm.links[key] = fromYamlList(sub[2] ?? "");
          }
          continue;
        }
      }
      const field = /^([A-Za-z]+):\s*(.*)$/.exec(line);
      if (field) {
        const key = field[1] ?? "";
        const value = field[2] ?? "";
        inLinks = false;
        switch (key) {
          case "tags":
            fm.tags = fromYamlList(value);
            break;
          case "links":
            inLinks = true;
            break;
          case "colour":
            fm.colour = value.trim();
            break;
          case "epic":
            fm.epic = value.trim();
            break;
          case "id":
            fm.id = value.trim();
            break;
          case "title":
            fm.title = value.trim();
            break;
          case "status":
            fm.status = value.trim();
            break;
          case "created":
            fm.created = value.trim();
            break;
          case "updated":
            fm.updated = value.trim();
            break;
          default:
            break;
        }
      }
      continue;
    }
    bodyLines.push(line);
  }
  fm.status = canonicalStatus(fm.status);
  return { fm, body: bodyLines.join("\n") };
};

export const serializeIssue = (issue: BoardIssue): string => {
  const { fm, body } = issue;
  const lines: Array<string> = [
    "---",
    `id: ${fm.id}`,
    `title: ${fm.title}`,
    `status: ${fm.status}`,
    `created: ${fm.created}`,
    `updated: ${fm.updated}`,
  ];
  if (fm.colour !== undefined && fm.colour !== "") {
    lines.push(`colour: ${fm.colour}`);
  }
  if (fm.epic !== undefined && fm.epic !== "") {
    lines.push(`epic: ${fm.epic}`);
  }
  lines.push(`tags: ${toYamlList(fm.tags)}`, "links:");
  for (const linkType of LINK_TYPES) {
    lines.push(`  ${linkType}: ${toYamlList(fm.links[linkType])}`);
  }
  lines.push("---");
  return `${lines.join("\r\n")}\r\n${body}`;
};
