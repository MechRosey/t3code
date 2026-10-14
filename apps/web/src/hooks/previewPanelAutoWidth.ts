import type { ChatWidth } from "@t3tools/contracts/settings";

export interface AutoPreviewPanelWidthInput {
  readonly rowWidth: number;
  readonly chatWidth: ChatWidth;
  readonly gitCardShown: boolean;
  readonly minWidth: number;
  readonly defaultWidth: number;
  readonly maxWidth: number;
}

export function resolveAutoPreviewPanelWidth(input: AutoPreviewPanelWidthInput): number {
  return input.minWidth;
}
