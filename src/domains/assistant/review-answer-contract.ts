export const AI_REVIEW_ANSWER_CONTRACT_VERSION = 1;

export const TASK_ASSISTANT_REVIEW_ANSWER_CONTRACT_VERSION = 2;

export const TASK_ASSISTANT_REVIEW_VERDICTS = [
  "가능",
  "불가",
  "조건부",
  "추가확인필요",
  "판단보류",
] as const;

export type UnifiedReviewVerdict = (typeof TASK_ASSISTANT_REVIEW_VERDICTS)[number];

export const AI_REVIEW_ANSWER_REQUIRED_HEADINGS = [
  "## 결론",
  "## 근거",
  "## 리스크",
  "## 후속 조치",
] as const;

export function buildAiReviewAnswerContractPrompt() {
  return [
    `AI review answer contract v${AI_REVIEW_ANSWER_CONTRACT_VERSION}:`,
    buildTaskAssistantReviewAnswerContractPrompt(),
    "Write answerMarkdown in Korean Markdown using these headings exactly:",
    ...AI_REVIEW_ANSWER_REQUIRED_HEADINGS.map((heading) => `- ${heading}`),
    "Under ## 근거, cite every material claim with an evidence marker like [evidence:<evidence id>].",
    "For legal or regulation claims, include law name, article label, official source/API URL when available, checkedAt, and the matching evidence marker.",
    "Under ## 리스크, separate evidence gaps from professional opinion and never present a legal, permit, or design conclusion as final.",
    "Under ## 후속 조치, write concrete next actions that can become task updates or follow-up tasks.",
    "If verified legal evidence is required but missing, say that generation is blocked by missing verified legal evidence instead of guessing.",
  ].join("\n");
}

export function hasAiReviewAnswerContractHeadings(answerMarkdown: string) {
  return AI_REVIEW_ANSWER_REQUIRED_HEADINGS.every((heading) => answerMarkdown.includes(heading));
}

export function buildTaskAssistantReviewAnswerContractPrompt() {
  return [
    `Task Assistant review answer contract v${TASK_ASSISTANT_REVIEW_ANSWER_CONTRACT_VERSION}:`,
    `Use exactly one final verdict from: ${TASK_ASSISTANT_REVIEW_VERDICTS.join(", ")}.`,
    "The ## 결론 section must integrate official law, approved internal WIKI, prior records/task evidence, and project evidence into one conclusion.",
    "Keep evidence/source sections separated by source family: official law, WIKI, prior records/task, project documents, and external evidence.",
    "Use applicability.officialVerified as the official verified article set; discuss applicability.candidates as related candidates, not final verified law.",
    "If candidateImpact.canChangeConclusion is true and candidateFactsMissing is non-empty for high-risk candidate concepts, the final verdict must be 추가확인필요.",
    "Expose candidateImpact, candidateFactsMissing, and conclusionMayChange in structured review metadata when available.",
  ].join("\n");
}

export function isUnifiedReviewVerdict(value: unknown): value is UnifiedReviewVerdict {
  return TASK_ASSISTANT_REVIEW_VERDICTS.includes(value as UnifiedReviewVerdict);
}
