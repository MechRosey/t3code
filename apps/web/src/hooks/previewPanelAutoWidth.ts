import type { ChatWidth } from "@t3tools/contracts/settings";

import {
  CHAT_CANVAS_LANE_PADDING,
  DETAILS_CARD_CLEARANCE,
} from "../components/chat/chatCanvasLayout";
import {
  THREAD_DETAILS_CARD_GAP,
  THREAD_DETAILS_CARD_WIDTH,
} from "../components/chat/threadDetailsCardLayout";

const CSS_REM_PIXELS = 16;
const COMFORTABLE_TEXT_MAX_REM = 46;
const CHAT_TEXT_MAX_REM_BY_WIDTH: Record<ChatWidth, number | null> = {
  comfortable: COMFORTABLE_TEXT_MAX_REM,
  wide: 72,
  full: null,
};
const DETAILS_CARD_RESERVED_WIDTH =
  THREAD_DETAILS_CARD_WIDTH + THREAD_DETAILS_CARD_GAP + DETAILS_CARD_CLEARANCE;

export interface AutoPreviewPanelWidthInput {
  readonly rowWidth: number;
  readonly chatWidth: ChatWidth;
  readonly gitCardShown: boolean;
  readonly minWidth: number;
  readonly defaultWidth: number;
  readonly maxWidth: number;
}

export function resolveAutoPreviewPanelWidth(input: AutoPreviewPanelWidthInput): number {
  const { rowWidth, chatWidth, gitCardShown, minWidth, defaultWidth, maxWidth } = input;
  const clamp = (width: number) => Math.max(minWidth, Math.min(maxWidth, Math.round(width)));
  if (!Number.isFinite(rowWidth) || rowWidth <= 0) return clamp(defaultWidth);

  const textMaxRem = CHAT_TEXT_MAX_REM_BY_WIDTH[chatWidth];
  const capBasisRem = textMaxRem ?? COMFORTABLE_TEXT_MAX_REM;
  const conversationCap =
    capBasisRem * CSS_REM_PIXELS +
    CHAT_CANVAS_LANE_PADDING +
    (gitCardShown ? DETAILS_CARD_RESERVED_WIDTH : CHAT_CANVAS_LANE_PADDING);
  const widthBeyondCap = rowWidth - conversationCap;
  const capApplies = textMaxRem !== null && widthBeyondCap >= defaultWidth;
  return clamp(
    capApplies ? widthBeyondCap : (rowWidth * defaultWidth) / (conversationCap + defaultWidth),
  );
}
