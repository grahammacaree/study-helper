export function questCanMarkDone(session: {
  questTeachbackOk?: boolean;
  questQuizOk?: boolean;
}): boolean {
  return Boolean(session.questTeachbackOk && session.questQuizOk);
}

export const QUEST_DONE_HINT = "Teach it back and finish the quiz first";
