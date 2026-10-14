import { useAtomValue } from "@effect/atom-react";
import { useEffect } from "react";

import { environmentPresentations } from "../../state/presentation";
import { recordPresentations } from "./usageLimitHistory";

export function UsageLimitHistoryRecorder() {
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  useEffect(() => {
    recordPresentations(presentations);
  }, [presentations]);
  return null;
}
