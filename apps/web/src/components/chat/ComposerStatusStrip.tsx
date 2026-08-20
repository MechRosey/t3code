import type { RateLimitBucket } from "@t3tools/contracts";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { RateLimitStatusSnapshot } from "~/lib/rateLimitStatus";
import {
  buildRateLimitPills,
  hasStatusStripContent,
  type RateLimitPillTone,
} from "./ComposerStatusStrip.logic";
import { WorkingTimer } from "./MessagesTimeline";

const PILL_VARIANT_BY_TONE: Record<RateLimitPillTone, "outline" | "warning" | "error"> = {
  muted: "outline",
  warning: "warning",
  error: "error",
};

function formatResetTooltip(resetsAt: number | null): string | null {
  if (resetsAt === null) {
    return null;
  }
  // rate_limit_info.resetsAt is a Unix epoch (Claude Agent SDK); render local time.
  const resetDate = new Date(resetsAt * 1000);
  return Number.isNaN(resetDate.getTime())
    ? null
    : `Resets ${resetDate.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
}

/**
 * Small statusline-style strip rendered under the chat input, mirroring
 * Claude Code CLI's statusline. Rate-limit segments are omitted entirely
 * (never a status-only or reset-time-only fallback) whenever the SDK hasn't
 * yet reported a utilization percentage for that bucket - see
 * lib/rateLimitStatus.ts for why that is the common, expected case rather
 * than a loading state.
 */
export function ComposerStatusStrip(props: {
  rateLimitSnapshots: ReadonlyMap<RateLimitBucket, RateLimitStatusSnapshot>;
  isWorking: boolean;
  workingSince: string | null;
}) {
  const pills = buildRateLimitPills(props.rateLimitSnapshots);
  const showWorkingTimer = props.isWorking && props.workingSince !== null;

  if (!hasStatusStripContent(props.rateLimitSnapshots, props.isWorking, props.workingSince)) {
    return null;
  }

  return (
    <div
      data-chat-composer-status-strip="true"
      className="flex shrink-0 items-center gap-1.5 text-secondary-label text-xs"
    >
      {showWorkingTimer ? (
        <span className="tabular-nums">
          Working for <WorkingTimer createdAt={props.workingSince!} />
        </span>
      ) : null}
      {pills.map((pill) => {
        const resetTooltip = formatResetTooltip(pill.resetsAt);
        const badge = (
          <Badge size="sm" variant={PILL_VARIANT_BY_TONE[pill.tone]}>
            {pill.label} {pill.percentageLabel}
          </Badge>
        );
        if (!resetTooltip) {
          return <span key={pill.bucket}>{badge}</span>;
        }
        return (
          <Tooltip key={pill.bucket}>
            <TooltipTrigger render={badge} />
            <TooltipPopup side="top">{resetTooltip}</TooltipPopup>
          </Tooltip>
        );
      })}
    </div>
  );
}
