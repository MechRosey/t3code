import { assert, describe, it } from "vite-plus/test";

import {
  BOARD_COLUMN_INITIAL_CARDS,
  BOARD_COLUMN_REVEAL_STEP,
  INITIAL_BOARD_COLUMN_REVEAL,
  boardColumnRevealKey,
  boardColumnWindow,
  revealMoreCards,
  revealedCardCount,
  syncColumnReveal,
  type BoardColumnRevealSource,
} from "./boardColumnWindow.logic";

const HIDDEN_TAIL = 10;
const COLUMN_SIZE = BOARD_COLUMN_INITIAL_CARDS + BOARD_COLUMN_REVEAL_STEP + HIDDEN_TAIL;
const SHORT_COLUMN_SIZE = BOARD_COLUMN_INITIAL_CARDS - HIDDEN_TAIL;

const DONE = "done";
const BACKLOG = "backlog";

const DEFAULT_SOURCE: BoardColumnRevealSource = {
  tag: null,
  sort: "updated-desc",
  tagSpec: "",
  query: "",
  epic: "",
  root: "/repo/one",
};

function columnCards(count: number) {
  return Array.from({ length: count }, (_, index) => ({ issue: { id: `card-${index}` } }));
}

const cardIds = (cards: ReadonlyArray<{ readonly issue: { readonly id: string } }>) =>
  cards.map((card) => card.issue.id);

describe("boardColumnWindow", () => {
  it("boardColumnWindow_NoSelection_MountsTheFirstRevealedCardsAndCountsTheRest", () => {
    const cards = columnCards(COLUMN_SIZE);

    const capped = boardColumnWindow(cards, BOARD_COLUMN_INITIAL_CARDS, null);
    assert.deepEqual(cardIds(capped.mounted), cardIds(cards.slice(0, BOARD_COLUMN_INITIAL_CARDS)));
    assert.equal(capped.hiddenCount, COLUMN_SIZE - BOARD_COLUMN_INITIAL_CARDS);

    const short = boardColumnWindow(
      columnCards(SHORT_COLUMN_SIZE),
      BOARD_COLUMN_INITIAL_CARDS,
      null,
    );
    assert.lengthOf(short.mounted, SHORT_COLUMN_SIZE);
    assert.equal(short.hiddenCount, 0);

    const exact = boardColumnWindow(cards, COLUMN_SIZE, null);
    assert.lengthOf(exact.mounted, COLUMN_SIZE);
    assert.equal(exact.hiddenCount, 0);

    const empty = boardColumnWindow(columnCards(0), BOARD_COLUMN_INITIAL_CARDS, null);
    assert.deepEqual(empty, { mounted: [], hiddenCount: 0 });
  });

  it("boardColumnWindow_SelectedCardBeyondRevealed_GrowsTheWindowToIncludeIt", () => {
    const cards = columnCards(COLUMN_SIZE);
    const deepIndex = BOARD_COLUMN_INITIAL_CARDS + HIDDEN_TAIL;
    const deepId = cards[deepIndex]!.issue.id;

    const deep = boardColumnWindow(cards, BOARD_COLUMN_INITIAL_CARDS, deepId);
    assert.lengthOf(deep.mounted, deepIndex + 1);
    assert.equal(deep.mounted.at(-1)?.issue.id, deepId);
    assert.equal(deep.hiddenCount, COLUMN_SIZE - deepIndex - 1);

    const lastId = cards.at(-1)!.issue.id;
    const last = boardColumnWindow(cards, BOARD_COLUMN_INITIAL_CARDS, lastId);
    assert.lengthOf(last.mounted, COLUMN_SIZE);
    assert.equal(last.hiddenCount, 0);

    const insideId = cards[0]!.issue.id;
    const inside = boardColumnWindow(cards, BOARD_COLUMN_INITIAL_CARDS, insideId);
    assert.lengthOf(inside.mounted, BOARD_COLUMN_INITIAL_CARDS);

    const elsewhere = boardColumnWindow(cards, BOARD_COLUMN_INITIAL_CARDS, "not-in-column");
    assert.lengthOf(elsewhere.mounted, BOARD_COLUMN_INITIAL_CARDS);
  });
});

describe("column reveal state", () => {
  it("revealMoreCards_RepeatedReveals_GrowOneColumnByAStepAndNeverShrink", () => {
    const key = boardColumnRevealKey(DEFAULT_SOURCE);
    assert.equal(
      revealedCardCount(INITIAL_BOARD_COLUMN_REVEAL, key, DONE),
      BOARD_COLUMN_INITIAL_CARDS,
    );

    const once = revealMoreCards(
      INITIAL_BOARD_COLUMN_REVEAL,
      key,
      DONE,
      BOARD_COLUMN_INITIAL_CARDS,
    );
    const afterOne = BOARD_COLUMN_INITIAL_CARDS + BOARD_COLUMN_REVEAL_STEP;
    assert.equal(revealedCardCount(once, key, DONE), afterOne);
    assert.equal(revealedCardCount(once, key, BACKLOG), BOARD_COLUMN_INITIAL_CARDS);

    const duplicate = revealMoreCards(once, key, DONE, BOARD_COLUMN_INITIAL_CARDS);
    assert.equal(revealedCardCount(duplicate, key, DONE), afterOne);

    const twice = revealMoreCards(once, key, DONE, afterOne);
    assert.equal(revealedCardCount(twice, key, DONE), afterOne + BOARD_COLUMN_REVEAL_STEP);

    const selectionGrown = afterOne + BOARD_COLUMN_REVEAL_STEP + HIDDEN_TAIL;
    const pastSelection = revealMoreCards(twice, key, DONE, selectionGrown);
    assert.equal(
      revealedCardCount(pastSelection, key, DONE),
      selectionGrown + BOARD_COLUMN_REVEAL_STEP,
    );
  });

  it("revealedCardCount_FilterOrSortChanged_FallsBackToTheInitialSize", () => {
    const key = boardColumnRevealKey(DEFAULT_SOURCE);
    const revealed = revealMoreCards(
      revealMoreCards(INITIAL_BOARD_COLUMN_REVEAL, key, DONE, BOARD_COLUMN_INITIAL_CARDS),
      key,
      BACKLOG,
      BOARD_COLUMN_INITIAL_CARDS,
    );
    const changedSources: ReadonlyArray<BoardColumnRevealSource> = [
      { ...DEFAULT_SOURCE, tag: "perf" },
      { ...DEFAULT_SOURCE, sort: "created-asc" },
      { ...DEFAULT_SOURCE, tagSpec: "perf" },
      { ...DEFAULT_SOURCE, query: "abc12" },
      { ...DEFAULT_SOURCE, epic: "board" },
      { ...DEFAULT_SOURCE, root: "/repo/two" },
    ];

    for (const source of changedSources) {
      const changedKey = boardColumnRevealKey(source);
      assert.notEqual(changedKey, key);
      assert.equal(revealedCardCount(revealed, changedKey, DONE), BOARD_COLUMN_INITIAL_CARDS);
      assert.equal(revealedCardCount(revealed, changedKey, BACKLOG), BOARD_COLUMN_INITIAL_CARDS);

      const afterChange = revealMoreCards(revealed, changedKey, DONE, BOARD_COLUMN_INITIAL_CARDS);
      assert.equal(revealedCardCount(afterChange, changedKey, BACKLOG), BOARD_COLUMN_INITIAL_CARDS);
    }
    assert.equal(boardColumnRevealKey({ ...DEFAULT_SOURCE }), key);
  });

  it("syncColumnReveal_ReturnToAnEarlierSignature_StartsFromTheInitialSize", () => {
    const keyA = boardColumnRevealKey(DEFAULT_SOURCE);
    const keyB = boardColumnRevealKey({ ...DEFAULT_SOURCE, query: "abc12" });
    const revealedUnderA = revealMoreCards(
      syncColumnReveal(INITIAL_BOARD_COLUMN_REVEAL, keyA),
      keyA,
      DONE,
      BOARD_COLUMN_INITIAL_CARDS,
    );
    assert.strictEqual(syncColumnReveal(revealedUnderA, keyA), revealedUnderA);

    const underB = syncColumnReveal(revealedUnderA, keyB);
    const backToA = syncColumnReveal(underB, keyA);

    assert.equal(revealedCardCount(underB, keyB, DONE), BOARD_COLUMN_INITIAL_CARDS);
    assert.equal(revealedCardCount(backToA, keyA, DONE), BOARD_COLUMN_INITIAL_CARDS);
  });
});
