export const BOARD_COLUMN_INITIAL_CARDS = 30;
export const BOARD_COLUMN_REVEAL_STEP = 30;

export interface BoardColumnWindowCard {
  readonly issue: { readonly id: string };
}

export interface BoardColumnWindow<Card extends BoardColumnWindowCard> {
  readonly mounted: ReadonlyArray<Card>;
  readonly hiddenCount: number;
}

export interface BoardColumnReveal {
  readonly key: string;
  readonly counts: Readonly<Record<string, number>>;
}

export interface BoardColumnRevealSource {
  readonly tag: string | null;
  readonly sort: string;
  readonly tagSpec: string;
  readonly query: string;
  readonly epic: string;
}

export const INITIAL_BOARD_COLUMN_REVEAL: BoardColumnReveal = { key: "", counts: {} };

export function boardColumnRevealKey(source: BoardColumnRevealSource): string {
  return JSON.stringify([source.tag, source.sort, source.tagSpec, source.query, source.epic]);
}

export function revealedCardCount(reveal: BoardColumnReveal, key: string, status: string): number {
  if (reveal.key !== key) return BOARD_COLUMN_INITIAL_CARDS;
  return reveal.counts[status] ?? BOARD_COLUMN_INITIAL_CARDS;
}

export function revealMoreCards(
  reveal: BoardColumnReveal,
  key: string,
  status: string,
  mountedCount: number,
): BoardColumnReveal {
  const counts = reveal.key === key ? reveal.counts : {};
  const revealed = Math.max(
    revealedCardCount(reveal, key, status),
    mountedCount + BOARD_COLUMN_REVEAL_STEP,
  );
  return { key, counts: { ...counts, [status]: revealed } };
}

export function boardColumnWindow<Card extends BoardColumnWindowCard>(
  cards: ReadonlyArray<Card>,
  revealed: number,
  selectedIssueId: string | null,
): BoardColumnWindow<Card> {
  const selectedIndex =
    selectedIssueId === null ? -1 : cards.findIndex((card) => card.issue.id === selectedIssueId);
  const mountedCount = Math.min(cards.length, Math.max(revealed, selectedIndex + 1));
  return { mounted: cards.slice(0, mountedCount), hiddenCount: cards.length - mountedCount };
}
