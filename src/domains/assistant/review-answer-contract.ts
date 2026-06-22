export const AI_REVIEW_ANSWER_CONTRACT_VERSION = 1;

export const AI_REVIEW_ANSWER_REQUIRED_HEADINGS = [
  "## 결론",
  "## 근거",
  "## 리스크",
  "## 후속 조치",
] as const;

export function buildAiReviewAnswerContractPrompt() {
  return [
    `AI review answer contract v${AI_REVIEW_ANSWER_CONTRACT_VERSION}:`,
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
