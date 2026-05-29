import type { AssistantEvidence } from "@/domains/assistant/types";

export const OFFICIAL_LAW_PROVIDER_NAME = "국가법령정보센터";
export const OFFICIAL_LAW_API_DOCS_URL = "https://open.law.go.kr/LSO/openApi/guideList.do";

const DEFAULT_LAW_API_BASE_URL = "https://www.law.go.kr/DRF";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_LOCATORS = 5;

const KNOWN_ARCHITECTURE_LAWS = [
  "건축법 시행규칙",
  "건축법 시행령",
  "건축법",
  "건축물의 피난ㆍ방화구조 등의 기준에 관한 규칙",
  "건축물의 설비기준 등에 관한 규칙",
  "주택건설기준 등에 관한 규칙",
  "주택건설기준 등에 관한 규정",
  "국토의 계획 및 이용에 관한 법률 시행령",
  "국토의 계획 및 이용에 관한 법률",
  "주차장법 시행규칙",
  "주차장법 시행령",
  "주차장법",
  "소방시설 설치 및 관리에 관한 법률 시행령",
  "소방시설 설치 및 관리에 관한 법률",
  "장애인ㆍ노인ㆍ임산부 등의 편의증진 보장에 관한 법률 시행령",
  "장애인ㆍ노인ㆍ임산부 등의 편의증진 보장에 관한 법률",
  "녹색건축물 조성 지원법 시행령",
  "녹색건축물 조성 지원법",
];

export type OfficialLawApiStatus = "verified" | "not_found" | "api_error" | "missing_query";

export type LawArticleLocator = {
  lawName: string;
  articleLabel?: string;
  articleNumber?: string;
  evidenceId?: string;
  sourceUrl?: string;
};

export type OfficialLawApiSource = {
  status: OfficialLawApiStatus;
  lawName: string;
  articleLabel?: string;
  articleNumber?: string;
  lawId?: string;
  lawSequenceNumber?: string;
  effectiveDate?: string;
  promulgationDate?: string;
  ministry?: string;
  sourceUrl?: string;
  apiUrl: string;
  searchApiUrl?: string;
  checkedAt: string;
  articleText?: string;
  reason: string;
  evidenceId?: string;
};

export type OfficialLawVerificationReport = {
  status: "not_required" | "verified" | "failed";
  checkedAt: string;
  provider: {
    name: typeof OFFICIAL_LAW_PROVIDER_NAME;
    docsUrl: typeof OFFICIAL_LAW_API_DOCS_URL;
  };
  locators: LawArticleLocator[];
  sources: OfficialLawApiSource[];
  failures: string[];
  retry: string[];
};

export type VerifyOfficialLawEvidenceInput = {
  question: string;
  evidence: AssistantEvidence[];
  fetchImpl?: typeof fetch;
  now?: () => Date;
  oc?: string;
  baseUrl?: string;
  timeoutMs?: number;
};

type LawSearchResult = {
  lawName: string;
  lawId?: string;
  lawSequenceNumber?: string;
  effectiveDate?: string;
  promulgationDate?: string;
  ministry?: string;
  sourceUrl?: string;
};

type OfficialLawApiConfig = {
  fetchImpl: typeof fetch;
  oc: string;
  baseUrl: string;
  timeoutMs: number;
};

export function requiresOfficialLawVerification(question: string, evidence: AssistantEvidence[]) {
  if (evidence.some((item) => item.kind === "regulation")) {
    return true;
  }

  return /법규|법령|법적|법률|규정|기준|건축법|시행령|시행규칙|조례|고시|인허가|허가|적법|조항|피난|방화|용적률|건폐율|주차장/.test(
    question,
  ) || /주택건설기준|공동주택|단지\s*(?:내|안)|도로\s*경사/.test(question);
}

export function extractLawArticleLocators(question: string, evidence: AssistantEvidence[]) {
  const locators: LawArticleLocator[] = [];
  const regulationEvidence = evidence.filter((item) => item.kind === "regulation");
  const questionArticle = extractArticleLocator(question);
  const questionLawNames = new Set(extractLawNames(question).map(normalizeLawName));

  for (const item of regulationEvidence) {
    const text = [item.title, item.excerpt, item.sourceUrl].filter(Boolean).join("\n");
    const fromUrl = item.sourceUrl ? extractLocatorFromLawUrl(item.sourceUrl) : null;
    const explicitArticle = extractArticleLocator(text) ?? fromUrl;
    const sourceLawNames = item.sourceUrl ? extractLawNamesFromLawUrl(item.sourceUrl) : [];
    const lawNames = sourceLawNames.length > 0 ? sourceLawNames : extractLawNames(text);

    for (const lawName of lawNames) {
      const article =
        explicitArticle ?? (questionArticle && questionLawNames.has(normalizeLawName(lawName)) ? questionArticle : null);
      if (questionArticle && !explicitArticle && !questionLawNames.has(normalizeLawName(lawName))) {
        continue;
      }
      locators.push({
        lawName,
        articleLabel: article?.articleLabel,
        articleNumber: article?.articleNumber,
        evidenceId: item.id,
        sourceUrl: sanitizeOfficialSourceUrl(item.sourceUrl),
      });
    }
  }

  if (locators.length === 0 && requiresOfficialLawVerification(question, evidence)) {
    const article = questionArticle;
    for (const lawName of extractLawNames(question)) {
      locators.push({
        lawName,
        articleLabel: article?.articleLabel,
        articleNumber: article?.articleNumber,
      });
    }
  }

  return dedupeLocators(locators).slice(0, MAX_LOCATORS);
}

export async function verifyOfficialLawEvidence(
  input: VerifyOfficialLawEvidenceInput,
): Promise<OfficialLawVerificationReport> {
  const checkedAt = (input.now?.() ?? new Date()).toISOString();
  const provider = {
    name: OFFICIAL_LAW_PROVIDER_NAME,
    docsUrl: OFFICIAL_LAW_API_DOCS_URL,
  } as const;

  if (!requiresOfficialLawVerification(input.question, input.evidence)) {
    return {
      status: "not_required",
      checkedAt,
      provider,
      locators: [],
      sources: [],
      failures: [],
      retry: [],
    };
  }

  const locators = extractLawArticleLocators(input.question, input.evidence);
  if (locators.length === 0) {
    return failedReport({
      checkedAt,
      provider,
      locators,
      sources: [
        {
          status: "missing_query",
          lawName: "",
          apiUrl: OFFICIAL_LAW_API_DOCS_URL,
          checkedAt,
          reason: "법령명 또는 조문 번호를 regulation evidence나 질문에서 찾지 못했습니다.",
        },
      ],
      failures: ["법령명 또는 조문 번호를 찾지 못해 공식 API 조회를 시작할 수 없습니다."],
    });
  }

  const oc = input.oc?.trim() || process.env.LAW_OPEN_DATA_OC?.trim();
  if (!oc) {
    return failedReport({
      checkedAt,
      provider,
      locators,
      sources: locators.map((locator) => ({
        status: "api_error" as const,
        lawName: locator.lawName,
        articleLabel: locator.articleLabel,
        articleNumber: locator.articleNumber,
        sourceUrl: sanitizeOfficialSourceUrl(locator.sourceUrl),
        apiUrl: OFFICIAL_LAW_API_DOCS_URL,
        checkedAt,
        reason: "서버 환경변수 LAW_OPEN_DATA_OC가 없어 공식 법령 API 검증을 수행할 수 없습니다.",
        evidenceId: locator.evidenceId,
      })),
      failures: ["서버 공식 법령 API 인증값 LAW_OPEN_DATA_OC가 구성되지 않았습니다."],
    });
  }

  const config: OfficialLawApiConfig = {
    fetchImpl: input.fetchImpl ?? fetch,
    oc,
    baseUrl: input.baseUrl?.replace(/\/$/, "") || DEFAULT_LAW_API_BASE_URL,
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };

  const sources = await Promise.all(
    locators.map((locator) => fetchOfficialLawArticle(locator, config, checkedAt)),
  );

  const failures = sources.filter((source) => source.status !== "verified").map((source) => source.reason);

  return {
    status: failures.length === 0 ? "verified" : "failed",
    checkedAt,
    provider,
    locators,
    sources,
    failures,
    retry:
      failures.length > 0
        ? [
            "서버 secret LAW_OPEN_DATA_OC와 법제처 Open API 도메인/IP 등록 상태를 확인한 뒤 다시 조회하세요.",
            "법령명과 조문 번호가 최신 국가법령정보센터 표기와 일치하는지 확인하세요.",
            "법제처 API가 실패하면 국가법령정보센터 원문 링크를 열어 수동 확인 후 근거를 다시 저장하세요.",
          ]
        : [],
  };
}

export function officialLawSourceToEvidence(source: OfficialLawApiSource): AssistantEvidence | null {
  if (source.status !== "verified" || !source.articleText) {
    return null;
  }

  const article = source.articleLabel ? ` ${source.articleLabel}` : "";
  const effectiveDate = source.effectiveDate ? ` 시행일자 ${formatDateToken(source.effectiveDate)}.` : "";
  return {
    id: `official-law:${source.lawId || source.lawSequenceNumber || normalizeText(source.lawName)}:${
      source.articleNumber || "all"
    }`,
    kind: "regulation",
    priority: 0,
    title: `${source.lawName}${article} 원문 확인`,
    excerpt: [
      `${OFFICIAL_LAW_PROVIDER_NAME} Open API로 ${source.checkedAt}에 확인했습니다.${effectiveDate}`,
      trimText(source.articleText, 900),
    ].join("\n"),
    sourceUrl: sanitizeOfficialSourceUrl(source.sourceUrl || source.apiUrl) || source.apiUrl,
    recordId: source.evidenceId,
    confidenceWeight: 0.95,
  };
}

function failedReport(input: {
  checkedAt: string;
  provider: OfficialLawVerificationReport["provider"];
  locators: LawArticleLocator[];
  sources: OfficialLawApiSource[];
  failures: string[];
}): OfficialLawVerificationReport {
  return {
    status: "failed",
    checkedAt: input.checkedAt,
    provider: input.provider,
    locators: input.locators,
    sources: input.sources,
    failures: input.failures,
    retry: [
      "서버 official-law verifier 설정과 네트워크 접근 권한을 확인하세요.",
      "질문이나 task evidence에 법령명과 조문(예: 건축법 제49조)을 명시하세요.",
    ],
  };
}

async function fetchOfficialLawArticle(
  locator: LawArticleLocator,
  config: OfficialLawApiConfig,
  checkedAt: string,
): Promise<OfficialLawApiSource> {
  const locatorSourceUrl = sanitizeOfficialSourceUrl(locator.sourceUrl);

  if (!locator.lawName.trim()) {
    return {
      status: "missing_query",
      lawName: locator.lawName,
      articleLabel: locator.articleLabel,
      articleNumber: locator.articleNumber,
      sourceUrl: locatorSourceUrl,
      apiUrl: OFFICIAL_LAW_API_DOCS_URL,
      checkedAt,
      reason: "법령명이 비어 있어 공식 API 조회를 건너뛰었습니다.",
      evidenceId: locator.evidenceId,
    };
  }

  if (!locator.articleNumber) {
    return {
      status: "missing_query",
      lawName: locator.lawName,
      articleLabel: locator.articleLabel,
      articleNumber: locator.articleNumber,
      sourceUrl: locatorSourceUrl,
      apiUrl: OFFICIAL_LAW_API_DOCS_URL,
      checkedAt,
      reason: `${locator.lawName} 조문 번호가 없어 공식 법령 API 검증을 건너뛰었습니다.`,
      evidenceId: locator.evidenceId,
    };
  }

  let currentApiUrl = OFFICIAL_LAW_API_DOCS_URL;
  let currentSearchApiUrl: string | undefined;
  try {
    const searchUrl = buildLawSearchUrl(locator.lawName, config);
    currentApiUrl = sanitizeOfficialApiUrl(searchUrl);
    currentSearchApiUrl = currentApiUrl;
    const searchJson = await fetchJson(searchUrl.toString(), config);
    const searchResults = parseLawSearchResults(searchJson);
    const selected = selectBestLawSearchResult(locator.lawName, searchResults);

    if (!selected) {
      return {
        status: "not_found",
        lawName: locator.lawName,
        articleLabel: locator.articleLabel,
        articleNumber: locator.articleNumber,
        sourceUrl: locatorSourceUrl,
        apiUrl: sanitizeOfficialApiUrl(searchUrl),
        searchApiUrl: sanitizeOfficialApiUrl(searchUrl),
        checkedAt,
        reason: `${locator.lawName} 검색 결과를 국가법령정보센터 Open API에서 찾지 못했습니다.`,
        evidenceId: locator.evidenceId,
      };
    }

    const articleUrl = buildLawArticleUrl(selected, locator, config);
    currentApiUrl = sanitizeOfficialApiUrl(articleUrl);
    const articleJson = await fetchJson(articleUrl.toString(), config);
    const articleText = extractArticleText(articleJson, locator.articleNumber);

    if (!articleText) {
      return {
        status: "not_found",
        lawName: selected.lawName || locator.lawName,
        articleLabel: locator.articleLabel,
        articleNumber: locator.articleNumber,
        lawId: selected.lawId,
        lawSequenceNumber: selected.lawSequenceNumber,
        effectiveDate: selected.effectiveDate,
        promulgationDate: selected.promulgationDate,
        ministry: selected.ministry,
        sourceUrl: sanitizeOfficialSourceUrl(selected.sourceUrl || locatorSourceUrl),
        apiUrl: sanitizeOfficialApiUrl(articleUrl),
        searchApiUrl: sanitizeOfficialApiUrl(searchUrl),
        checkedAt,
        reason: `${selected.lawName || locator.lawName} ${locator.articleLabel || ""} 원문 조문을 찾지 못했습니다.`,
        evidenceId: locator.evidenceId,
      };
    }

    return {
      status: "verified",
      lawName: selected.lawName || locator.lawName,
      articleLabel: locator.articleLabel,
      articleNumber: locator.articleNumber,
      lawId: selected.lawId,
      lawSequenceNumber: selected.lawSequenceNumber,
      effectiveDate: selected.effectiveDate,
      promulgationDate: selected.promulgationDate,
      ministry: selected.ministry,
      sourceUrl: sanitizeOfficialSourceUrl(selected.sourceUrl || locatorSourceUrl),
      apiUrl: sanitizeOfficialApiUrl(articleUrl),
      searchApiUrl: sanitizeOfficialApiUrl(searchUrl),
      checkedAt,
      articleText,
      reason: `${OFFICIAL_LAW_PROVIDER_NAME} Open API에서 원문을 확인했습니다.`,
      evidenceId: locator.evidenceId,
    };
  } catch (error) {
    return {
      status: "api_error",
      lawName: locator.lawName,
      articleLabel: locator.articleLabel,
      articleNumber: locator.articleNumber,
      sourceUrl: locatorSourceUrl,
      apiUrl: currentApiUrl,
      searchApiUrl: currentSearchApiUrl,
      checkedAt,
      reason: error instanceof Error ? error.message : "공식 법령 API 조회 중 알 수 없는 오류가 발생했습니다.",
      evidenceId: locator.evidenceId,
    };
  }
}

function buildLawSearchUrl(lawName: string, config: OfficialLawApiConfig) {
  const url = new URL(`${config.baseUrl}/lawSearch.do`);
  url.searchParams.set("OC", config.oc);
  url.searchParams.set("target", "eflaw");
  url.searchParams.set("type", "JSON");
  url.searchParams.set("query", lawName);
  url.searchParams.set("display", "5");
  url.searchParams.set("page", "1");
  url.searchParams.set("nw", "3");
  return url;
}

function buildLawArticleUrl(selected: LawSearchResult, locator: LawArticleLocator, config: OfficialLawApiConfig) {
  const url = new URL(`${config.baseUrl}/lawService.do`);
  url.searchParams.set("OC", config.oc);
  url.searchParams.set("target", "eflaw");
  url.searchParams.set("type", "JSON");

  if (selected.lawId) {
    url.searchParams.set("ID", selected.lawId);
  } else if (selected.lawSequenceNumber && selected.effectiveDate) {
    url.searchParams.set("MST", selected.lawSequenceNumber);
    url.searchParams.set("efYd", selected.effectiveDate);
  } else {
    url.searchParams.set("LM", selected.lawName || locator.lawName);
  }

  if (locator.articleNumber) {
    url.searchParams.set("JO", locator.articleNumber);
  }

  return url;
}

async function fetchJson(url: string, config: OfficialLawApiConfig): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await config.fetchImpl(url, { signal: controller.signal });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`공식 법령 API가 HTTP ${response.status}를 반환했습니다.`);
    }

    const parsed = JSON.parse(text) as unknown;
    const apiError = findApiErrorMessage(parsed);
    if (apiError) {
      throw new Error(apiError);
    }
    return parsed;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`공식 법령 API 조회가 ${config.timeoutMs}ms 후 시간 초과되었습니다.`);
    }
    if (error instanceof SyntaxError) {
      throw new Error("공식 법령 API 응답을 JSON으로 해석할 수 없습니다.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseLawSearchResults(value: unknown): LawSearchResult[] {
  const lawSearch = findFirstRecordByKey(value, "LawSearch") ?? (isRecord(value) ? value : null);
  const lawValue = lawSearch ? lawSearch["law"] ?? lawSearch["Law"] : undefined;
  const rows = Array.isArray(lawValue) ? lawValue : lawValue ? [lawValue] : [];

  return rows.filter(isRecord).map((row) => ({
    lawName: firstString(row, ["법령명한글", "법령명_한글", "법령명", "법령약칭명"]),
    lawId: firstString(row, ["법령ID", "lawId", "ID"]),
    lawSequenceNumber: firstString(row, ["법령일련번호", "MST", "lsiSeq"]),
    effectiveDate: firstString(row, ["시행일자", "efYd"]),
    promulgationDate: firstString(row, ["공포일자", "ancYd"]),
    ministry: firstString(row, ["소관부처명", "소관부처"]),
    sourceUrl: normalizeOfficialSourceUrl(firstString(row, ["법령상세링크", "상세링크"])),
  }));
}

function selectBestLawSearchResult(lawName: string, results: LawSearchResult[]) {
  const normalized = normalizeLawName(lawName);
  return (
    results.find((result) => normalizeLawName(result.lawName) === normalized) ??
    results.find((result) => normalizeLawName(result.lawName).includes(normalized)) ??
    results[0] ??
    null
  );
}

function extractArticleText(value: unknown, articleNumber?: string) {
  const articleRecords = collectRecords(value).filter((record) => hasAnyKey(record, ["조문내용", "조문제목", "항내용"]));
  const selected =
    articleNumber && articleRecords.length > 0
      ? articleRecords.find((record) => articleMatches(record, articleNumber))
      : articleRecords[0];

  return selected ? normalizeWhitespace(flattenArticleRecord(selected)).slice(0, 6000) : "";
}

function articleMatches(record: Record<string, unknown>, articleNumber: string) {
  const parsed = parseArticleNumber(articleNumber);
  if (!parsed) {
    return false;
  }

  const main = Number(firstString(record, ["조문번호"]));
  const sub = Number(firstString(record, ["조문가지번호"]) || "0");
  return main === parsed.main && sub === parsed.sub;
}

function flattenArticleRecord(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(flattenArticleRecord).filter(Boolean).join("\n");
  }
  if (!isRecord(value)) {
    return "";
  }

  const direct = ["조문내용", "조문제목", "항내용", "호내용", "목내용", "조문참고자료"]
    .map((key) => (typeof value[key] === "string" ? String(value[key]) : ""))
    .filter(Boolean)
    .join("\n");
  const nested = Object.values(value)
    .filter((item) => typeof item === "object" && item !== null)
    .map(flattenArticleRecord)
    .filter(Boolean)
    .join("\n");
  return [direct, nested].filter(Boolean).join("\n");
}

function extractLawNames(text: string) {
  const names = new Set<string>();
  const orderedNames: string[] = [];
  const normalizedText = normalizeWhitespace(text);
  const addName = (value: string) => {
    const cleaned = cleanLawName(value);
    if (!isUsefulLawName(cleaned) || names.has(cleaned)) {
      return;
    }
    names.add(cleaned);
    orderedNames.push(cleaned);
  };

  for (const knownLaw of KNOWN_ARCHITECTURE_LAWS) {
    if (normalizedText.includes(knownLaw)) {
      addName(knownLaw);
    }
  }
  for (const match of normalizedText.matchAll(/「([^」]{2,80}?(?:법|시행령|시행규칙|조례|규칙|고시))」/g)) {
    addName(match[1]);
  }
  for (const match of normalizedText.matchAll(/([가-힣ㆍ·\s]{2,60}?(?:법 시행령|법 시행규칙|법|조례|규칙|고시))/g)) {
    addName(match[1]);
  }

  return orderedNames;
}

function extractArticleLocator(text: string): Pick<LawArticleLocator, "articleLabel" | "articleNumber"> | null {
  const match = normalizeWhitespace(text).match(/제\s*(\d{1,4})\s*조(?:\s*의\s*(\d{1,2}))?/);
  if (!match) {
    return null;
  }

  const main = Number(match[1]);
  const sub = match[2] ? Number(match[2]) : 0;
  if (!Number.isInteger(main) || main <= 0 || !Number.isInteger(sub) || sub < 0) {
    return null;
  }

  return {
    articleLabel: `제${main}조${sub > 0 ? `의${sub}` : ""}`,
    articleNumber: `${String(main).padStart(4, "0")}${String(sub).padStart(2, "0")}`,
  };
}

function extractLocatorFromLawUrl(sourceUrl: string): Pick<LawArticleLocator, "articleLabel" | "articleNumber"> | null {
  try {
    const url = new URL(sourceUrl);
    const jo = url.searchParams.get("JO");
    if (jo && /^\d{6}$/.test(jo)) {
      const parsed = parseArticleNumber(jo);
      return parsed
        ? {
            articleNumber: jo,
            articleLabel: `제${parsed.main}조${parsed.sub > 0 ? `의${parsed.sub}` : ""}`,
          }
        : null;
    }

    return extractArticleLocator(decodeURIComponent(url.pathname));
  } catch {
    return null;
  }
}

function extractLawNamesFromLawUrl(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);
    if (!/law\.go\.kr$/i.test(url.hostname)) {
      return [];
    }

    const decodedPath = decodeURIComponent(url.pathname);
    const match = decodedPath.match(/\/법령\/([^/?#]+)/);
    if (!match) {
      return [];
    }

    const rawName = cleanLawName(match[1]);
    const knownLaw = KNOWN_ARCHITECTURE_LAWS.find((lawName) => normalizeLawName(lawName) === normalizeLawName(rawName));
    const lawName = knownLaw ?? rawName;
    return isUsefulLawName(lawName) ? [lawName] : [];
  } catch {
    return [];
  }
}

function dedupeLocators(locators: LawArticleLocator[]) {
  const seen = new Set<string>();
  return locators.filter((locator) => {
    const key = `${normalizeLawName(locator.lawName)}:${locator.articleNumber || ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function parseArticleNumber(value: string) {
  if (!/^\d{6}$/.test(value)) {
    return null;
  }

  return {
    main: Number(value.slice(0, 4)),
    sub: Number(value.slice(4, 6)),
  };
}

function findFirstRecordByKey(value: unknown, key: string): Record<string, unknown> | null {
  if (isRecord(value)) {
    if (isRecord(value[key])) {
      return value[key];
    }
    for (const child of Object.values(value)) {
      const found = findFirstRecordByKey(child, key);
      if (found) {
        return found;
      }
    }
  }
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findFirstRecordByKey(child, key);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function collectRecords(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.flatMap(collectRecords);
  }
  if (!isRecord(value)) {
    return [];
  }

  return [value, ...Object.values(value).flatMap(collectRecords)];
}

function findApiErrorMessage(value: unknown): string {
  const records = collectRecords(value);
  for (const record of records) {
    const message = firstString(record, ["error", "Error", "message", "Message", "오류", "오류메시지", "result", "msg"]);
    const detail = firstString(record, ["msg", "message", "Message", "오류메시지"]);
    if (message && /오류|error|invalid|denied|승인|인증|실패|검증/i.test(message)) {
      const suffix = detail && detail !== message ? ` (${detail})` : "";
      return `공식 법령 API 오류: ${message}${suffix}`;
    }
  }

  return "";
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") {
      return String(value).trim();
    }
  }
  return "";
}

function hasAnyKey(record: Record<string, unknown>, keys: string[]) {
  return keys.some((key) => key in record);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanLawName(value: string) {
  return normalizeWhitespace(value)
    .replace(/^(근거|관련|현재|공식|다음|및|또는|이|그|해당|대한)\s+/g, "")
    .replace(/[,:;.\])}]+$/g, "")
    .trim();
}

function isUsefulLawName(value: string) {
  if (value.length < 3 || value.length > 80) {
    return false;
  }
  if (/[0-9]|(^|\s)조(\s|$)|제\s*\d+\s*조/.test(value)) {
    return false;
  }
  if (
    /관련|질문|검색|결과|원문|출처|공식|검토|나오면|센터의|법령정보센터|국가법/.test(value) &&
    !KNOWN_ARCHITECTURE_LAWS.includes(value)
  ) {
    return false;
  }

  return !["법규", "법령", "관련 법", "법", "시행령", "시행규칙", "조례", "규칙", "고시"].includes(
    normalizeWhitespace(value),
  );
}

function normalizeLawName(value: string) {
  return normalizeWhitespace(value).replace(/[「」\s]/g, "");
}

function normalizeText(value: string) {
  return normalizeWhitespace(value).replace(/\s/g, "-").replace(/[^가-힣a-zA-Z0-9-]/g, "");
}

function normalizeWhitespace(value: string) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeOfficialSourceUrl(value: string) {
  if (!value) {
    return "";
  }

  const normalized = /^https?:\/\//i.test(value)
    ? value.replace(/^http:\/\//i, "https://")
    : `https://www.law.go.kr${value.startsWith("/") ? "" : "/"}${value}`;

  return sanitizeOfficialSourceUrl(normalized) || normalized;
}

function sanitizeOfficialSourceUrl(value?: string) {
  if (!value) {
    return undefined;
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const sanitized = new URL(value);
      sanitized.searchParams.delete("OC");
      return sanitized.toString();
    } catch {
      return value;
    }
  }

  return stripOcQueryParam(value);
}

function stripOcQueryParam(value: string) {
  const queryIndex = value.indexOf("?");
  if (queryIndex === -1) {
    return value;
  }

  const hashIndex = value.indexOf("#", queryIndex);
  const withoutHash = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : value.slice(hashIndex);
  const base = withoutHash.slice(0, queryIndex);
  const params = new URLSearchParams(withoutHash.slice(queryIndex + 1));
  if (!params.has("OC")) {
    return value;
  }

  params.delete("OC");
  const query = params.toString();
  return `${base}${query ? `?${query}` : ""}${hash}`;
}

function sanitizeOfficialApiUrl(value: URL) {
  const sanitized = new URL(value.toString());
  sanitized.searchParams.delete("OC");
  return sanitized.toString();
}

function formatDateToken(value: string) {
  return /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value;
}

function trimText(value: string, maxLength: number) {
  const text = normalizeWhitespace(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
