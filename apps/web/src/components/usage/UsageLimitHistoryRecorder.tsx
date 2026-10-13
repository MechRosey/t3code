import { useAtomValue } from "@effect/atom-react";
import { collectLimitAccounts } from "@t3tools/shared/usageLimits";
import { useEffect } from "react";

import { environmentPresentations } from "../../state/presentation";
import { recordLimitAccounts } from "./usageLimitHistory";

export function UsageLimitHistoryRecorder() {
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  useEffect(() => {
    recordLimitAccounts(collectLimitAccounts(presentations));
  }, [presentations]);
  return null;
}
