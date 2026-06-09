import type { AssistantEvidence } from "@/domains/assistant/types";

const LEGAL_REVIEW_KEYWORDS =
  /법규|법령|법적|법률|규정|기준|건축법|시행령|시행규칙|조례|고시|인허가|허가|적법|조문|조항|피난|방화|용적률|건폐율|주차장|주택건설기준|공동주택|단지\s*(?:내|안)|도로\s*경사/;

export function requiresCentralizedLegalVerification(question: string, evidence: AssistantEvidence[] = []) {
  return evidence.some((item) => item.kind === "regulation") || LEGAL_REVIEW_KEYWORDS.test(question);
}

export function isCentralizedVerifiedLegalEvidence(evidence: AssistantEvidence) {
  return evidence.kind === "regulation" && Boolean(
    Boolean(evidence.legal) ||
    evidence.verificationStatus === "verified" ||
    evidence.id.startsWith("verified-legal-")
  );
}
