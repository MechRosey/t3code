import { HEADER_ALIASES, MARKER_ALIASES } from "./vocabulary.ts";

export interface IssueSectionState {
  content: boolean;
  marker?: boolean;
  text?: string;
}

export interface IssueOpenQuestions {
  content: boolean;
  hasOpen: boolean;
  hasHumanOpen: boolean;
}

export interface IssueSections {
  brief: { content: boolean; text: string };
  reading: { content: boolean; marker: boolean };
  doing: { content: boolean; marker: boolean };
  log: { content: boolean };
  openQuestions: IssueOpenQuestions;
}

const SECTION_KINDS: Readonly<Record<string, "brief" | "reading" | "doing" | "log">> = {
  brief: "brief",
  summary: "brief",
  "reading summary": "reading",
  investigation: "reading",
  "doing summary": "doing",
  implementation: "doing",
  log: "log",
};

const READING_MARKERS = ["READ-COMPLETE", "INVESTIGATION-COMPLETE"] as const;
const DOING_MARKERS = ["DO-COMPLETE", "IMPLEMENTATION-COMPLETE"] as const;

const containsAny = (text: string, markers: readonly string[]): boolean =>
  markers.some((marker) => text.includes(marker));

export const getSectionMap = (body: string): IssueSections => {
  const content = { brief: false, reading: false, doing: false, log: false };
  let logText = "";
  let briefText = "";
  let openContent = false;
  let openHasOpen = false;
  let openHasHumanOpen = false;

  const headers: Array<{ name: string; start: number; end: number }> = [];
  const headerPattern = /^##[ \t]+(.+?)[ \t]*$/gm;
  for (let match = headerPattern.exec(body); match !== null; match = headerPattern.exec(body)) {
    headers.push({
      name: match[1] ?? "",
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    if (header === undefined) continue;
    const { name, start, end } = header;
    const isOpenQuestions = name.toLowerCase() === "open questions";
    const kind = SECTION_KINDS[name.toLowerCase()];
    if (!isOpenQuestions && kind === undefined) continue;
    const sectionStart = end;
    const nextHeader = headers[i + 1];
    const sectionEnd = nextHeader !== undefined ? nextHeader.start : body.length;
    const text = body.slice(sectionStart, sectionEnd);
    const trimmed = text.trim();
    if (isOpenQuestions) {
      if (trimmed.length > 0) openContent = true;
      for (const lineMatch of text.matchAll(/^[ \t]*-[ \t]+.*$/gm)) {
        if (!lineMatch[0].includes("~~")) {
          openHasOpen = true;
          if (/^[ \t]*-[ \t]+\[human\]/.test(lineMatch[0])) openHasHumanOpen = true;
        }
      }
      continue;
    }
    if (kind === undefined) continue;
    if (trimmed.length > 0) content[kind] = true;
    if (kind === "brief" && trimmed.length > 0) briefText = trimmed;
    if (kind === "log") logText = text;
  }

  return {
    brief: { content: content.brief, text: briefText },
    reading: { content: content.reading, marker: containsAny(logText, READING_MARKERS) },
    doing: { content: content.doing, marker: containsAny(logText, DOING_MARKERS) },
    log: { content: content.log },
    openQuestions: {
      content: openContent,
      hasOpen: openHasOpen,
      hasHumanOpen: openHasHumanOpen,
    },
  };
};

export const hasStaleVocabulary = (text: string): boolean => {
  for (const old of Object.keys(HEADER_ALIASES)) {
    if (new RegExp(`^##[ \\t]+${old}[ \\t]*(?=\\r?$)`, "m").test(text)) return true;
  }
  for (const old of Object.keys(MARKER_ALIASES)) {
    if (text.includes(old)) return true;
  }
  return false;
};
