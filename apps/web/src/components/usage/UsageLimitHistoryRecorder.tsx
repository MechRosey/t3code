import { useAtomMount, useAtomSubscribe } from "@effect/atom-react";

import { environmentPresentations } from "../../state/presentation";
import { recordPresentations } from "./usageLimitHistory";

export function UsageLimitHistoryRecorder() {
  useAtomMount(environmentPresentations.presentationsAtom);
  useAtomSubscribe(environmentPresentations.presentationsAtom, recordPresentations, {
    immediate: true,
  });
  return null;
}
