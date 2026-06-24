import type {
  ProjectWikiAssistantSearchResult,
  ProjectWikiItem,
  ProjectWikiSourceBadge,
} from "@/domains/project-wiki/types";

export type RankProjectWikiItemsInput = {
  items: ProjectWikiItem[];
  query: string;
  excludedItemIds?: Iterable<string>;
  limit?: number;
};

export type ProjectWikiSourceBadgeInput = {
  sourceBadge?: ProjectWikiSourceBadge;
  sourceKind?: string;
  commonCandidateRecordId?: string | null;
};

export function rankProjectWikiItems(input: RankProjectWikiItemsInput): ProjectWikiAssistantSearchResult[] {
  const excludedItemIds = new Set(input.excludedItemIds ?? []);
  const limit = Math.max(0, input.limit ?? 5);
  if (limit === 0) {
    return [];
  }

  return input.items
    .filter((item) => item.status === "active" && !excludedItemIds.has(item.id))
    .map((item) => {
      const score = scoreProjectWikiItem(item, input.query);
      return {
        item,
        score: score.score,
        matchedTerms: score.matchedTerms,
        sourceBadge: resolveProjectWikiSourceBadge(item),
      } satisfies ProjectWikiAssistantSearchResult;
    })
    .filter((result) => result.score > 0)
    .sort(compareProjectWikiSearchResults)
    .slice(0, limit);
}

export function scoreProjectWikiItem(item: ProjectWikiItem, query: string) {
  const terms = tokenizeProjectWikiSearchText(query);
  if (terms.length === 0) {
    return { score: 0, matchedTerms: [] };
  }

  const matches = new Set<string>();
  let score = 0;
  score += scoreTerms(item.title, terms, 5, matches);
  score += scoreTerms(item.tags.join(" "), terms, 4, matches);
  score += scoreTerms(item.summary, terms, 3, matches);
  score += scoreTerms(item.bodyMarkdown, terms, 1, matches);
  score += scoreTerms(item.supplementalNote, terms, 1, matches);

  const combinedText = projectWikiSearchText(item).toLowerCase();
  const normalizedQuery = query.toLowerCase().trim();
  if (normalizedQuery.length >= 4 && combinedText.includes(normalizedQuery)) {
    score += 2;
  }
  if (item.aiSuitabilityState === "recommended") {
    score += 1;
  }
  if (item.commonCandidateRecordId) {
    score += 0.5;
  }

  return { score, matchedTerms: [...matches] };
}

export function resolveProjectWikiSourceBadge(input: ProjectWikiSourceBadgeInput): ProjectWikiSourceBadge {
  if (input.sourceBadge) {
    return input.sourceBadge;
  }

  switch (input.sourceKind) {
    case "approved_wiki":
    case "common_wiki":
      return "공용 WIKI";
    case "task":
    case "task_context":
      return "task";
    case "project_document":
    case "document":
      return "도면/문서";
    case "legal_evidence":
    case "regulation":
      return "법규";
    case "external_evidence":
    case "web_or_skill":
      return "외부";
    default:
      return "프로젝트 WIKI";
  }
}

export function tokenizeProjectWikiSearchText(value: string) {
  return [
    ...new Set(
      value
        .toLowerCase()
        .replace(/[^\p{Letter}\p{Number}\s-]/gu, " ")
        .split(/\s+/u)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2),
    ),
  ];
}

export function projectWikiSearchText(item: ProjectWikiItem) {
  return [
    item.title,
    item.summary,
    item.bodyMarkdown,
    item.tags.join(" "),
    item.supplementalNote,
    item.aiSuitabilityReason,
    item.commonizationCaution,
  ]
    .join(" ")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function compareProjectWikiSearchResults(
  left: ProjectWikiAssistantSearchResult,
  right: ProjectWikiAssistantSearchResult,
) {
  const scoreDelta = right.score - left.score;
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  return right.item.updatedAt.localeCompare(left.item.updatedAt);
}

function scoreTerms(value: string, terms: string[], weight: number, matches: Set<string>) {
  const haystack = value.toLowerCase();
  return terms.reduce((score, term) => {
    if (!haystack.includes(term)) {
      return score;
    }
    matches.add(term);
    return score + weight;
  }, 0);
}
