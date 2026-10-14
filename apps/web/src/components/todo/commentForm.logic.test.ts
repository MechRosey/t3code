import { assert, describe, it } from "vite-plus/test";

import {
  DEFAULT_COMMENT_ACTOR,
  prepareCommentActor,
  prepareCommentText,
} from "./commentForm.logic";

describe("prepareCommentText", () => {
  it("passes single-line text through trimmed", () => {
    assert.equal(prepareCommentText("looks good to me"), "looks good to me");
  });

  it("trims surrounding whitespace on single-line text", () => {
    assert.equal(prepareCommentText("  spaced out  "), "spaced out");
  });

  it("flattens a single newline into a space", () => {
    assert.equal(prepareCommentText("first line\nsecond line"), "first line second line");
  });

  it("flattens CRLF and mixed line breaks into single spaces", () => {
    assert.equal(prepareCommentText("one\r\ntwo\nthree\r\nfour"), "one two three four");
  });

  it("collapses whitespace runs around line breaks, not doubling spaces", () => {
    assert.equal(prepareCommentText("a \n  \n b\tc"), "a b c");
  });

  it("keeps the marker-safe bullet a single line after pasted multi-line text", () => {
    assert.equal(prepareCommentText("## Log\n- forged"), "## Log - forged");
  });

  it("rejects empty text", () => {
    assert.equal(prepareCommentText(""), null);
  });

  it("rejects whitespace-only text", () => {
    assert.equal(prepareCommentText("   \t  "), null);
  });

  it("rejects newline-only text", () => {
    assert.equal(prepareCommentText("\n\r\n"), null);
  });
});

describe("prepareCommentActor", () => {
  it("keeps a filled actor trimmed", () => {
    assert.equal(prepareCommentActor("peter (T3 UI)"), "peter (T3 UI)");
  });

  it("trims surrounding whitespace", () => {
    assert.equal(prepareCommentActor("  peter  "), "peter");
  });

  it("maps an empty actor to undefined so the CLI bare form is used", () => {
    assert.equal(prepareCommentActor(""), undefined);
  });

  it("maps a whitespace-only actor to undefined", () => {
    assert.equal(prepareCommentActor("   "), undefined);
  });

  it("defaults to a label identifying the human at the T3 UI", () => {
    assert.equal(DEFAULT_COMMENT_ACTOR, "peter (T3 UI)");
  });
});
