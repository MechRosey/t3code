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

export function boardColumnRevealKey(_source: BoardColumnRevealSource): string {
  return "";
}

export function revealedCardCount(
  _reveal: BoardColumnReveal,
  _key: string,
  _status: string,
): number {
  return BOARD_COLUMN_INITIAL_CARDS;
}

export function revealMoreCards(
  reveal: BoardColumnReveal,
  _key: string,
  _status: string,
  _mountedCount: number,
): BoardColumnReveal {
  return reveal;
}

export function boardColumnWindow<Card extends BoardColumnWindowCard>(
  cards: ReadonlyArray<Card>,
  _revealed: number,
  _selectedIssueId: string | null,
): BoardColumnWindow<Card> {
  return { mounted: cards, hiddenCount: 0 };
}
