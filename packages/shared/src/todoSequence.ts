const SEQUENCE_ENTRY_SEPARATOR = " ";
const WHITESPACE_RUN = /\s+/;

export const sequenceEntryIds = (entry: string): Array<string> =>
  entry.split(WHITESPACE_RUN).filter((id) => id !== "");

export const joinSequenceEntry = (ids: ReadonlyArray<string>): string =>
  ids.join(SEQUENCE_ENTRY_SEPARATOR);
