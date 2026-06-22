import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  fetchVerifiedLegalSearchEvidence,
  mapLegalSearchPayloadToEvidence,
  selectLegalSearchContext,
} from "../src/use-cases/verified-legal-search-service";
import {
  normalizeAssistantEvidenceForStorage,
  sanitizeClientSubmittedAssistantEvidenceForStorage,
} from "../src/use-cases/assistant-service";

async function main() {
  const mapped = mapLegalSearchPayloadToEvidence({
    queryId: "legal_query:adapter-fixture",
    hits: [
      {
        chunkId: "chunk:act-11",
        sourceId: "law:building-act",
        sourceKind: "statute",
        authorityRank: "statute",
        title: "건축법",
        excerpt: "건축법 제11조 건축허가 기준",
        effective: { effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" },
        stale: false,
        answerReady: true,
        sourceUrl: `https://open.law.go.kr/LSO/lawService.do?OC${"="}secret&target=law`,
        locator: {
          lawId: "building-act",
          article: "11",
          url: `https://open.law.go.kr/LSO/lawService.do?OC${"="}secret&target=law`,
        },
        warnings: ["LEGAL_CHANGE_REVIEW_REQUIRED"],
      },
      {
        chunkId: "chunk:molit",
        sourceId: "interpretation:molit",
        sourceKind: "molitInterpretation",
        authorityRank: "ministry_interpretation",
        title: "국토교통부 질의회신",
        excerpt: "국토부 해석 사례",
        effective: { effectiveFrom: "2026-01-01" },
        stale: false,
        answerReady: true,
        warnings: ["VERIFY_CURRENT_STATUTE_FIRST"],
      },
      {
        chunkId: "chunk:context",
        sourceId: "ordinance:other",
        sourceKind: "localOrdinance",
        authorityRank: "local_ordinance",
        title: "타 지자체 조례",
        excerpt: "문맥용 조례",
        effective: { effectiveFrom: "2026-01-01" },
        stale: false,
        answerReady: false,
        warnings: ["LOCAL_ORDINANCE_JURISDICTION_MISMATCH"],
      },
    ],
    warnings: ["API_ORIGIN_METADATA_INCOMPLETE:interpretation:molit"],
    graphExpansion: {
      maxDepth: 1,
      mode: "answer",
      seedNodeIds: ["chunk:chunk:act-11"],
      nodeIds: ["chunk:chunk:act-11", "source:law:building-act"],
      nodeLabels: ["건축법 제11조", "건축법"],
      edgeIds: ["contains:source_law_building_act:chunk_act_11"],
    },
  });
  assert.equal(mapped.evidence.length, 2);
  assert.equal(mapped.evidence[0]?.kind, "regulation");
  assert.equal(mapped.evidence[0]?.sourceUrl, "https://open.law.go.kr/LSO/lawService.do?target=law");
  assert.equal(mapped.evidence[0]?.officialSourceName, "Verified Legal Evidence API");
  assert.equal(mapped.evidence[0]?.lawName, "건축법");
  assert.equal(mapped.evidence[0]?.articleLabel, "제11조");
  assert.equal(mapped.evidence[0]?.articleNumber, "11");
  assert.match(mapped.evidence[0]?.checkedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(mapped.evidence[0]?.apiSourceUrl, "https://open.law.go.kr/LSO/lawService.do?target=law");
  assert.equal(mapped.evidence[0]?.verificationStatus, "verified");
  assert.equal(mapped.evidence[0]?.recordId, "law:building-act");
  assert.deepEqual(mapped.evidence[0]?.legal, {
    sourceId: "law:building-act",
    chunkId: "chunk:act-11",
    sourceKind: "statute",
    authorityRank: "statute",
    effective: { effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" },
    stale: false,
    legalChangeWarnings: ["LEGAL_CHANGE_REVIEW_REQUIRED"],
    locator: {
      lawId: "building-act",
      article: "11",
      url: "https://open.law.go.kr/LSO/lawService.do?target=law",
    },
    confidenceReason:
      "Answer-ready verified statute source; authority rank statute; effective from 2026-01-01 to 2026-12-31; source locator available; legal-change review required.",
  });
  assert.equal(mapped.evidence[1]?.title, "MOLIT/ministry interpretation: 국토교통부 질의회신");
  assert.deepEqual(mapped.evidence[1]?.legal?.locator, {
    sourceId: "interpretation:molit",
    chunkId: "chunk:molit",
  });
  assert.equal(mapped.warnings.some((warning) => warning.code === "VERIFIED_LEGAL_SEARCH_API_ORIGIN_METADATA_INCOMPLETE"), true);

  const noAnswerReady = mapLegalSearchPayloadToEvidence({
    queryId: "legal_query:no-answer-ready",
    hits: [
      {
        chunkId: "chunk:stale-only",
        sourceId: "law:building-act",
        sourceKind: "statute",
        authorityRank: "statute",
        title: "stale only",
        excerpt: "stale only",
        effective: { effectiveFrom: "2026-01-01" },
        stale: true,
        answerReady: false,
        warnings: ["STALE_LEGAL_SOURCE"],
      },
    ],
    warnings: [],
  });
  assert.deepEqual(noAnswerReady.evidence, []);
  assert.equal(noAnswerReady.warnings.some((warning) => warning.code === "VERIFIED_LEGAL_SEARCH_NO_ANSWER_READY"), true);
  assert.equal(noAnswerReady.warnings.some((warning) => warning.code === "VERIFIED_LEGAL_SEARCH_STALE_LEGAL_SOURCE"), true);
  assert.equal(
    noAnswerReady.warnings.some((warning) => warning.message.includes("legal basis was not verified")),
    true,
  );

  const answerReadyWarning = mapLegalSearchPayloadToEvidence({
    queryId: "legal_query:answer-ready-warning",
    hits: [{
      chunkId: "chunk:answer-ready-warning",
      sourceId: "law:changed",
      sourceKind: "statute",
      authorityRank: "statute",
      title: "Changed answer-ready statute",
      excerpt: "Changed answer-ready statute excerpt",
      effective: { effectiveFrom: "2026-01-01" },
      stale: false,
      answerReady: true,
      warnings: ["LEGAL_CHANGE_REVIEW_REQUIRED"],
    }],
    warnings: [],
  });
  assert.equal(answerReadyWarning.evidence.length, 1);
  assert.equal(
    answerReadyWarning.warnings.some((warning) => warning.code === "VERIFIED_LEGAL_SEARCH_LEGAL_CHANGE_REVIEW_REQUIRED"),
    false,
  );

  const answerReadyMixedWarnings = mapLegalSearchPayloadToEvidence({
    queryId: "legal_query:answer-ready-mixed-warnings",
    hits: [{
      chunkId: "chunk:mixed-warnings",
      sourceId: "law:mixed-warnings",
      sourceKind: "statute",
      authorityRank: "statute",
      title: "Mixed warning statute",
      excerpt: "Mixed warning statute excerpt",
      effective: { effectiveFrom: "2026-01-01" },
      stale: false,
      answerReady: true,
      warnings: ["LEGAL_CHANGE_REVIEW_REQUIRED", "EFFECTIVE_FROM_MISSING_LOWER_CONFIDENCE"],
    }],
    warnings: [],
  });
  assert.deepEqual(answerReadyMixedWarnings.evidence[0]?.legal?.legalChangeWarnings, ["LEGAL_CHANGE_REVIEW_REQUIRED"]);

  const caseInsensitiveOcSourceUrl = mapLegalSearchPayloadToEvidence({
    queryId: "legal_query:case-insensitive-oc-source-url",
    hits: [{
      chunkId: "chunk:case-insensitive-oc",
      sourceId: "law:case-insensitive-oc",
      sourceKind: "statute",
      authorityRank: "statute",
      title: "OC source URL",
      excerpt: "OC source URL excerpt",
      effective: { effectiveFrom: "2026-01-01" },
      stale: false,
      answerReady: true,
      sourceUrl: `https://open.law.go.kr/LSO/lawService.do?oC${"="}raw-token&target=law`,
      warnings: [],
    }],
    warnings: [],
  });
  assert.equal(caseInsensitiveOcSourceUrl.evidence[0]?.sourceUrl, "https://open.law.go.kr/LSO/lawService.do?target=law");

  const previousLegalEvidenceApiUrl = process.env.VERIFIED_LEGAL_EVIDENCE_API_URL;
  const previousLegalSearchApiUrl = process.env.VERIFIED_LEGAL_SEARCH_API_URL;
  const previousLegalSearchEnabled = process.env.VERIFIED_LEGAL_SEARCH_ENABLED;
  const previousVerifiedLegalEvidenceApiSecret = process.env.VERIFIED_LEGAL_EVIDENCE_API_SECRET;
  const previousVercelBypassSecret = process.env.VERIFIED_LEGAL_EVIDENCE_VERCEL_BYPASS_SECRET;
  try {
    process.env.VERIFIED_LEGAL_EVIDENCE_API_URL = "http://legacy-evidence.local";
    delete process.env.VERIFIED_LEGAL_SEARCH_API_URL;
    delete process.env.VERIFIED_LEGAL_SEARCH_ENABLED;
    process.env.VERIFIED_LEGAL_EVIDENCE_API_SECRET = "fixture-legal-api-secret";
    delete process.env.VERIFIED_LEGAL_EVIDENCE_VERCEL_BYPASS_SECRET;
    let legacyOnlyFetchCalled = false;
    const legacyOnly = await fetchVerifiedLegalSearchEvidence({
      question: "legacy bundle only",
      fetchImpl: async () => {
        legacyOnlyFetchCalled = true;
        return Response.json({ queryId: "legal_query:legacy-only", hits: [], warnings: [] });
      },
    });
    assert.deepEqual(legacyOnly, { evidence: [], warnings: [] });
    assert.equal(legacyOnlyFetchCalled, false);

    process.env.VERIFIED_LEGAL_SEARCH_API_URL = "http://legal-search.local";
    const explicitSearchUrl = await fetchVerifiedLegalSearchEvidence({
      question: "explicit search endpoint",
      fetchImpl: async (input) => {
        assert.equal(String(input), "http://legal-search.local/api/legal/search");
        return Response.json({
          queryId: "legal_query:explicit-search",
          hits: [{
            chunkId: "chunk:explicit",
            sourceId: "law:explicit",
            sourceKind: "statute",
            authorityRank: "statute",
            title: "Explicit legal source",
            excerpt: "Explicit legal source excerpt",
            effective: { effectiveFrom: "2026-01-01" },
            stale: false,
            answerReady: true,
            warnings: [],
          }],
          warnings: [],
        });
      },
    });
    assert.equal(explicitSearchUrl.evidence.length, 1);

    let transientNetworkCalls = 0;
    const transientNetworkRecovery = await fetchVerifiedLegalSearchEvidence({
      question: "transient legal search network failure",
      fetchImpl: async (input) => {
        transientNetworkCalls += 1;
        assert.equal(String(input), "http://legal-search.local/api/legal/search");
        if (transientNetworkCalls === 1) {
          throw new Error("cold start connection reset");
        }
        return Response.json({
          queryId: "legal_query:transient-network-recovery",
          hits: [{
            chunkId: "chunk:transient-network",
            sourceId: "law:transient-network",
            sourceKind: "statute",
            authorityRank: "statute",
            title: "Recovered legal source",
            excerpt: "Recovered legal source excerpt",
            effective: { effectiveFrom: "2026-01-01" },
            stale: false,
            answerReady: true,
            warnings: [],
          }],
          warnings: [],
        });
      },
    });
    assert.equal(transientNetworkCalls, 2);
    assert.equal(transientNetworkRecovery.evidence.length, 1);

    let transientHttpCalls = 0;
    const transientHttpRecovery = await fetchVerifiedLegalSearchEvidence({
      question: "transient legal search http failure",
      fetchImpl: async () => {
        transientHttpCalls += 1;
        if (transientHttpCalls === 1) {
          return new Response("cold start timeout", { status: 503 });
        }
        return Response.json({
          queryId: "legal_query:transient-http-recovery",
          hits: [{
            chunkId: "chunk:transient-http",
            sourceId: "law:transient-http",
            sourceKind: "statute",
            authorityRank: "statute",
            title: "Recovered HTTP legal source",
            excerpt: "Recovered HTTP legal source excerpt",
            effective: { effectiveFrom: "2026-01-01" },
            stale: false,
            answerReady: true,
            warnings: [],
          }],
          warnings: [],
        });
      },
    });
    assert.equal(transientHttpCalls, 2);
    assert.equal(transientHttpRecovery.evidence.length, 1);

    let authFailureCalls = 0;
    const authFailureNoRetry = await fetchVerifiedLegalSearchEvidence({
      question: "legal search auth failure",
      fetchImpl: async () => {
        authFailureCalls += 1;
        return new Response("forbidden", { status: 403 });
      },
    });
    assert.equal(authFailureCalls, 1);
    assert.equal(authFailureNoRetry.warnings[0]?.code, "VERIFIED_LEGAL_SEARCH_API_HTTP_ERROR");
    assert.equal(authFailureNoRetry.warnings[0]?.message, "Verified Legal Evidence search returned 403.");
  } finally {
    restoreEnv("VERIFIED_LEGAL_EVIDENCE_API_URL", previousLegalEvidenceApiUrl);
    restoreEnv("VERIFIED_LEGAL_SEARCH_API_URL", previousLegalSearchApiUrl);
    restoreEnv("VERIFIED_LEGAL_SEARCH_ENABLED", previousLegalSearchEnabled);
    restoreEnv("VERIFIED_LEGAL_EVIDENCE_API_SECRET", previousVerifiedLegalEvidenceApiSecret);
    restoreEnv("VERIFIED_LEGAL_EVIDENCE_VERCEL_BYPASS_SECRET", previousVercelBypassSecret);
  }

  const sanitizedWarnings = mapLegalSearchPayloadToEvidence({
      queryId: "legal_query:sanitized-warnings",
      hits: [],
      warnings: [{
        code: "UPSTREAM",
        message: `Upstream URL https://open.law.go.kr/LSO/lawService.do?OC${"="}secret-oc&target=law failed`,
      }],
    });
  const serializedWarnings = JSON.stringify(sanitizedWarnings.warnings);
  assert.equal(serializedWarnings.includes(`OC${"="}`), false);
  assert.equal(serializedWarnings.includes("secret-oc"), false);
  const sanitizedConfidenceReason = mapLegalSearchPayloadToEvidence({
      queryId: "legal_query:sanitized-confidence-reason",
      hits: [{
        chunkId: "chunk:sanitized-confidence",
        sourceId: "law:sanitized-confidence",
        sourceKind: "statute",
        authorityRank: "statute",
        title: "Sanitized confidence source",
        excerpt: "Sanitized confidence excerpt",
        effective: { effectiveFrom: "2026-01-01" },
        stale: false,
        answerReady: true,
        confidenceReason: `Upstream reason for OC${"="}secret-oc`,
        warnings: [],
      }],
      warnings: [],
    });
  const serializedConfidenceReason = JSON.stringify(sanitizedConfidenceReason.evidence);
  assert.equal(serializedConfidenceReason.includes(`OC${"="}`), false);
  assert.equal(serializedConfidenceReason.includes("secret-oc"), false);
  assert.equal(
    sanitizedConfidenceReason.evidence[0]?.legal?.confidenceReason?.includes("[redacted-credential]"),
    true,
  );
  const sanitizedChunkId = mapLegalSearchPayloadToEvidence({
      queryId: "legal_query:sanitized-chunk-id",
      hits: [{
        chunkId: `chunk:OC${"="}secret-oc`,
        sourceId: "law:sanitized-chunk",
        sourceKind: "statute",
        authorityRank: "statute",
        title: "Sanitized chunk source",
        excerpt: "Sanitized chunk excerpt",
        effective: { effectiveFrom: "2026-01-01" },
        stale: false,
        answerReady: true,
        warnings: [],
      }],
      warnings: [],
    });
    const serializedChunkId = JSON.stringify(sanitizedChunkId.evidence);
    assert.equal(serializedChunkId.includes(`OC${"="}`), false);
    assert.equal(serializedChunkId.includes("secret-oc"), false);
    assert.equal(serializedChunkId.includes("[redacted-credential]"), true);
    const sanitizedNonAnswerWarningSourceId = mapLegalSearchPayloadToEvidence({
      queryId: "legal_query:sanitized-non-answer-source-id",
      hits: [{
        chunkId: "chunk:sanitized-non-answer",
        sourceId: `law:OC${"="}secret-oc`,
        sourceKind: "statute",
        authorityRank: "statute",
        title: "Sanitized non-answer source",
        excerpt: "Sanitized non-answer excerpt",
        effective: { effectiveFrom: "2026-01-01" },
        stale: true,
        answerReady: false,
        warnings: ["STALE_LEGAL_SOURCE"],
      }],
      warnings: [],
    });
    const serializedNonAnswerWarningSourceId = JSON.stringify(sanitizedNonAnswerWarningSourceId.warnings);
    assert.equal(serializedNonAnswerWarningSourceId.includes(`OC${"="}`), false);
    assert.equal(serializedNonAnswerWarningSourceId.includes("secret-oc"), false);
    assert.equal(serializedNonAnswerWarningSourceId.includes("[redacted-credential]"), true);
    const sanitizedLocatorKey = mapLegalSearchPayloadToEvidence({
      queryId: "legal_query:sanitized-locator-key",
      hits: [{
        chunkId: "chunk:sanitized-locator-key",
        sourceId: "law:sanitized-locator-key",
        sourceKind: "statute",
        authorityRank: "statute",
        title: "Sanitized locator key source",
        excerpt: "Sanitized locator key excerpt",
        effective: { effectiveFrom: "2026-01-01" },
        stale: false,
        answerReady: true,
        locator: {
          [`OC${"="}secret-oc`]: "must not persist",
          safeLocator: "article-1",
        },
        warnings: [],
      }],
      warnings: [],
    });
    const serializedLocatorKey = JSON.stringify(sanitizedLocatorKey.evidence);
    assert.equal(serializedLocatorKey.includes(`OC${"="}`), false);
    assert.equal(serializedLocatorKey.includes("secret-oc"), false);
    assert.equal(serializedLocatorKey.includes("safeLocator"), true);

  assert.deepEqual(selectLegalSearchContext({
    task: {
      locationRef: "서울특별시 강남구",
      dueDate: "2026-08-01",
      issueTitle: "건축허가",
      issueDetailNote: "",
    },
    projectName: "부산 프로젝트",
    currentDate: "2026-05-30T12:34:56.000Z",
  }), {
    jurisdiction: "서울",
    effectiveDate: "2026-05-30",
  });
  assert.deepEqual(selectLegalSearchContext({
    currentDate: "2026-05-30T15:30:00.000Z",
  }), {
    effectiveDate: "2026-05-31",
  });
  assert.deepEqual(selectLegalSearchContext({
    currentDate: "2026-05-30T14:59:59.000Z",
  }), {
    effectiveDate: "2026-05-30",
  });
  assert.deepEqual(selectLegalSearchContext({
    currentDate: "2026-05-30T12:00:00+09:00",
  }), {
    effectiveDate: "2026-05-30",
  });
  assert.deepEqual(selectLegalSearchContext({
    currentDate: "2026-05-30T15:30:00",
  }), {
    effectiveDate: "2026-05-30",
  });
  assert.deepEqual(selectLegalSearchContext({
    currentDate: "2026-13-01T00:00:00Z",
  }), {
    effectiveDate: "",
  });
  assert.deepEqual(selectLegalSearchContext({
    currentDate: "2026-02-31T00:00:00Z",
  }), {
    effectiveDate: "",
  });
  assert.deepEqual(selectLegalSearchContext({
    currentDate: "2026-13-01T00:00:00.0000Z",
  }), {
    effectiveDate: "",
  });
  assert.deepEqual(selectLegalSearchContext({
    currentDate: "2026-02-31T00:00:00.0000Z",
  }), {
    effectiveDate: "",
  });
  assert.deepEqual(selectLegalSearchContext({
    task: {
      locationRef: "",
      dueDate: "",
      issueTitle: "검토",
      issueDetailNote: "대전광역시 유성구 대지안의 공지",
    },
    projectName: "서울형 디자인",
    currentDate: "2026.5.3",
  }), {
    jurisdiction: "대전",
    effectiveDate: "2026-05-03",
  });
  assert.deepEqual(selectLegalSearchContext({
    task: {
      locationRef: "서울형 디자인 가이드",
      dueDate: "",
      issueTitle: "서울형",
      issueDetailNote: "",
    },
    projectName: "일반 프로젝트",
    currentDate: "20260530",
  }), {
    effectiveDate: "2026-05-30",
  });
  assert.deepEqual(selectLegalSearchContext({
    task: {
      locationRef: "부산광역시 해운대구",
      dueDate: "",
      issueTitle: "",
      issueDetailNote: "",
    },
    projectName: "서울 프로젝트",
    currentDate: "2026-05-30",
  }), {
    jurisdiction: "부산",
    effectiveDate: "2026-05-30",
  });

  const missingSourceId = mapLegalSearchPayloadToEvidence({
    queryId: "legal_query:missing-source-id",
    hits: [{
      chunkId: "chunk:missing-source",
      sourceKind: "statute",
      authorityRank: "statute",
      title: "source id missing",
      excerpt: "source id missing",
      effective: { effectiveFrom: "2026-01-01" },
      stale: false,
      answerReady: true,
      warnings: [],
    }],
    warnings: [],
  });
  assert.deepEqual(missingSourceId.evidence, []);
  assert.equal(missingSourceId.warnings[0]?.code, "VERIFIED_LEGAL_SEARCH_INVALID");

  const normalizedStorageEvidence = normalizeAssistantEvidenceForStorage([{
    id: "legal-storage",
    kind: "regulation",
    priority: 2,
    title: "Stored legal evidence",
    excerpt: "Stored excerpt",
    sourceUrl: `https://open.law.go.kr/LSO/lawService.do?oC${"="}raw-token&target=law`,
    recordId: "law:building-act",
    officialSourceName: "국가법령정보센터",
    lawName: "건축법",
    articleLabel: "제11조",
    articleNumber: "11",
    effectiveDate: "2026-01-01",
    checkedAt: "2026-06-08T00:00:00.000Z",
    apiSourceUrl: "https://open.law.go.kr/LSO/lawService.do?target=law",
    verificationStatus: "verified",
    legal: mapped.evidence[0]?.legal,
  }]);
  assert.deepEqual(normalizedStorageEvidence[0]?.legal, mapped.evidence[0]?.legal);
  assert.equal(normalizedStorageEvidence[0]?.sourceUrl, "https://open.law.go.kr/LSO/lawService.do?target=law");
  assert.equal(normalizedStorageEvidence[0]?.officialSourceName, "국가법령정보센터");
  assert.equal(normalizedStorageEvidence[0]?.lawName, "건축법");
  assert.equal(normalizedStorageEvidence[0]?.articleLabel, "제11조");
  assert.equal(normalizedStorageEvidence[0]?.articleNumber, "11");
  assert.equal(normalizedStorageEvidence[0]?.effectiveDate, "2026-01-01");
  assert.equal(normalizedStorageEvidence[0]?.checkedAt, "2026-06-08T00:00:00.000Z");
  assert.equal(normalizedStorageEvidence[0]?.apiSourceUrl, "https://open.law.go.kr/LSO/lawService.do?target=law");
  assert.equal(normalizedStorageEvidence[0]?.verificationStatus, "verified");
  const storedSecretBearingLegalEvidence = normalizeAssistantEvidenceForStorage([{
      id: "legal-storage-secret",
      kind: "regulation",
      priority: 2,
      title: "Stored secret legal evidence",
      excerpt: "Stored secret legal excerpt",
      legal: {
        sourceId: `law:OC${"="}stored-secret`,
        chunkId: `chunk:OC${"="}stored-secret`,
        sourceKind: "statute",
        authorityRank: "statute",
        stale: false,
        legalChangeWarnings: [`LEGAL_CHANGE_REVIEW_REQUIRED:OC${"="}stored-secret`],
        confidenceReason: `Reason includes OC${"="}stored-secret`,
        locator: {
          [`OC${"="}stored-secret`]: "must not persist",
          [`prefixOC${"="}raw-token`]: "must not persist",
          safeLocator: "article-1",
        },
      },
    }]);
  const serializedStoredSecretBearingLegalEvidence = JSON.stringify(storedSecretBearingLegalEvidence);
  assert.equal(serializedStoredSecretBearingLegalEvidence.includes(`OC${"="}`), false);
  assert.equal(serializedStoredSecretBearingLegalEvidence.includes("stored-secret"), false);
  assert.equal(serializedStoredSecretBearingLegalEvidence.includes("raw-token"), false);
  assert.equal(
    storedSecretBearingLegalEvidence[0]?.legal?.confidenceReason?.includes("[redacted-credential]"),
    true,
  );
  assert.equal(serializedStoredSecretBearingLegalEvidence.includes("safeLocator"), true);
  const malformedStoredLegalEvidence = normalizeAssistantEvidenceForStorage([{
    id: "legal-storage-malformed",
    kind: "regulation",
    priority: 2,
    title: "Malformed stored legal evidence",
    excerpt: "Malformed stored legal excerpt",
    legal: {
      sourceId: "law:malformed",
      sourceKind: "statute",
      authorityRank: "project_context",
      stale: false,
      legalChangeWarnings: [],
    },
  }]);
  assert.equal(malformedStoredLegalEvidence[0]?.legal, undefined);

  const clientSubmittedLegalEvidence = sanitizeClientSubmittedAssistantEvidenceForStorage([{
    id: "client-submitted-legal",
    kind: "regulation",
    priority: 1,
    title: "Client submitted legal evidence",
    excerpt: "The generic records route must not trust this as verified legal evidence.",
    sourceUrl: "https://open.law.go.kr/LSO/lawService.do?target=law",
    recordId: "law:client-submitted",
    confidenceWeight: 0.99,
    officialSourceName: "국가법령정보센터",
    lawName: "건축법",
    articleLabel: "제11조",
    articleNumber: "11",
    effectiveDate: "2026-01-01",
    checkedAt: "2026-06-17T00:00:00.000Z",
    apiSourceUrl: "https://open.law.go.kr/LSO/lawService.do?target=law",
    verificationStatus: "verified",
    legal: mapped.evidence[0]?.legal,
  }]);
  assert.equal(clientSubmittedLegalEvidence.removedLegalVerificationClaim, true);
  assert.equal(clientSubmittedLegalEvidence.evidence[0]?.verificationStatus, undefined);
  assert.equal(clientSubmittedLegalEvidence.evidence[0]?.legal, undefined);
  assert.equal(clientSubmittedLegalEvidence.evidence[0]?.officialSourceName, undefined);
  assert.equal(clientSubmittedLegalEvidence.evidence[0]?.lawName, undefined);
  assert.equal(clientSubmittedLegalEvidence.evidence[0]?.apiSourceUrl, undefined);
  assert.equal(clientSubmittedLegalEvidence.evidence[0]?.confidenceWeight, 0.45);

  const missingApiSecret = await fetchVerifiedLegalSearchEvidence({
    question: "건축법",
    serviceUrl: "http://legal.local",
    apiSecret: "",
    fetchImpl: async () => {
      throw new Error("fetch must not run without VERIFIED_LEGAL_EVIDENCE_API_SECRET");
    },
  });
  assert.deepEqual(missingApiSecret.evidence, []);
  assert.equal(missingApiSecret.warnings[0]?.code, "VERIFIED_LEGAL_EVIDENCE_API_SECRET_MISSING");

  const captured: Array<{ url: string; body: unknown; headers?: Record<string, string>; signal?: AbortSignal }> = [];
  const fetched = await fetchVerifiedLegalSearchEvidence({
    question: "건축법 제11조",
    jurisdiction: "서울",
    effectiveDate: "2026-05-30",
    serviceUrl: "http://legal.local",
    apiSecret: "fixture-legal-api-secret",
    fetchImpl: async (input, init) => {
      captured.push({
        url: String(input),
        body: JSON.parse(String(init?.body)),
        headers: init?.headers as Record<string, string> | undefined,
        signal: init?.signal ?? undefined,
      });
      return Response.json({
        queryId: "legal_query:fetch",
        hits: [{
          chunkId: "chunk:act-11",
          sourceId: "law:building-act",
          sourceKind: "statute",
          authorityRank: "statute",
          title: "건축법",
          excerpt: "건축법 제11조",
          effective: { effectiveFrom: "2026-01-01" },
          stale: false,
          answerReady: true,
          warnings: [],
        }],
        warnings: [],
      });
    },
  });
  assert.equal(fetched.evidence.length, 1);
  assert.equal(captured[0]?.url, "http://legal.local/api/legal/search");
  assert.deepEqual(captured[0]?.body, {
    query: "건축법 제11조",
    jurisdiction: "서울",
    effectiveDate: "2026-05-30",
    limit: 6,
  });
  assert.ok(captured[0]?.signal instanceof AbortSignal);
  assert.equal(JSON.stringify(captured[0]?.body).includes("diagnosticMode"), false);
  assert.equal(JSON.stringify(captured[0]?.body).includes("sourceIds"), false);
  assert.equal(JSON.stringify(captured[0]?.body).includes("authority"), false);
  assert.equal(captured[0]?.headers?.["x-verified-legal-evidence-api-secret"], "fixture-legal-api-secret");
  assert.equal(captured[0]?.headers?.["x-vercel-protection-bypass"], undefined);

  const previousFetchBypassSecret = process.env.VERIFIED_LEGAL_EVIDENCE_VERCEL_BYPASS_SECRET;
  try {
    process.env.VERIFIED_LEGAL_EVIDENCE_VERCEL_BYPASS_SECRET = "fixture-vercel-bypass";
    const bypassCaptured: Array<{ headers?: Record<string, string> }> = [];
    await fetchVerifiedLegalSearchEvidence({
      question: "건축법 제11조",
      serviceUrl: "http://legal.local",
      apiSecret: "fixture-legal-api-secret",
      fetchImpl: async (_input, init) => {
        bypassCaptured.push({ headers: init?.headers as Record<string, string> | undefined });
        return Response.json({
          queryId: "legal_query:bypass",
          hits: [{
            chunkId: "chunk:act-11",
            sourceId: "law:building-act",
            sourceKind: "statute",
            authorityRank: "statute",
            title: "건축법",
            excerpt: "건축법 제11조",
            effective: { effectiveFrom: "2026-01-01" },
            stale: false,
            answerReady: true,
            warnings: [],
          }],
          warnings: [],
        });
      },
    });
    assert.equal(bypassCaptured[0]?.headers?.["x-vercel-protection-bypass"], "fixture-vercel-bypass");
  } finally {
    restoreEnv("VERIFIED_LEGAL_EVIDENCE_VERCEL_BYPASS_SECRET", previousFetchBypassSecret);
  }

  const invalidJsonOkResponse = await fetchVerifiedLegalSearchEvidence({
    question: "건축법",
    serviceUrl: "http://legal.local",
    apiSecret: "fixture-legal-api-secret",
    fetchImpl: async () => new Response("not-json", { status: 200 }),
  });
  assert.deepEqual(invalidJsonOkResponse.evidence, []);
  assert.equal(invalidJsonOkResponse.warnings[0]?.code, "VERIFIED_LEGAL_SEARCH_INVALID");

  const invalidContractCases: Array<{ name: string; payload: unknown }> = [
    {
      name: "missing queryId",
      payload: {
        hits: [],
        warnings: [],
      },
    },
    {
      name: "non-string queryId",
      payload: {
        queryId: 123,
        hits: [],
        warnings: [],
      },
    },
    {
      name: "wrong queryId prefix",
      payload: {
        queryId: "search:wrong-prefix",
        hits: [],
        warnings: [],
      },
    },
    {
      name: "hits is not an array",
      payload: {
        queryId: "legal_query:invalid-hits",
        hits: {},
        warnings: [],
      },
    },
    {
      name: "warnings is not an array",
      payload: {
        queryId: "legal_query:invalid-warnings",
        hits: [],
        warnings: {},
      },
    },
    {
      name: "malformed warning entry",
      payload: {
        queryId: "legal_query:invalid-warning-entry",
        hits: [],
        warnings: [123],
      },
    },
    {
      name: "malformed graphExpansion",
      payload: {
        queryId: "legal_query:invalid-graph-expansion",
        hits: [],
        warnings: [],
        graphExpansion: {
          maxDepth: 3,
          mode: "answer",
          seedNodeIds: ["chunk:chunk:act-11"],
          nodeIds: ["source:law:building-act"],
          nodeLabels: ["건축법"],
          edgeIds: ["contains:edge"],
        },
      },
    },
    {
      name: "malformed answer-ready hit",
      payload: {
        queryId: "legal_query:malformed-hit",
        hits: [{
          chunkId: "chunk:malformed",
          sourceId: "law:malformed",
          sourceKind: "statute",
          authorityRank: "statute",
          title: "Malformed hit",
          excerpt: "Malformed hit",
          answerReady: true,
          warnings: [],
        }],
        warnings: [],
      },
    },
    {
      name: "source kind and authority rank mismatch",
      payload: {
        queryId: "legal_query:rank-mismatch",
        hits: [{
          chunkId: "chunk:rank-mismatch",
          sourceId: "law:rank-mismatch",
          sourceKind: "statute",
          authorityRank: "project_context",
          title: "Rank mismatch",
          excerpt: "Rank mismatch excerpt",
          effective: { effectiveFrom: "2026-01-01" },
          stale: false,
          answerReady: true,
          warnings: [],
        }],
        warnings: [],
      },
    },
  ];
  for (const contractCase of invalidContractCases) {
    const invalid = mapLegalSearchPayloadToEvidence(contractCase.payload);
    assert.deepEqual(invalid.evidence, [], contractCase.name);
    assert.equal(invalid.warnings[0]?.code, "VERIFIED_LEGAL_SEARCH_INVALID", contractCase.name);
    assert.equal(
      invalid.warnings.some((warning) => warning.code === "VERIFIED_LEGAL_SEARCH_NO_ANSWER_READY"),
      false,
      contractCase.name,
    );
  }

  const assistantServiceModule = await import("../src/use-cases/assistant-service");
  assert.equal(typeof assistantServiceModule.mergeRetrievedAssistantEvidence, "function");
  const mergedEvidence = assistantServiceModule.mergeRetrievedAssistantEvidence({
    baseEvidence: [{
      id: "task:base",
      kind: "task",
      priority: 3,
      title: "Base task",
      excerpt: "Base task excerpt",
    }],
    verifiedLegalEvidence: {
      evidence: [],
      warnings: [{
        code: "BUNDLE_WARNING",
        message: `bundle warning https://open.law.go.kr/LSO/lawService.do?OC${"="}bundle-secret&target=law`,
      }],
    },
    verifiedLegalSearchEvidence: noAnswerReady,
  });
  assert.equal(mergedEvidence.evidence[0]?.id, "task:base");
  const mergedWarningText = JSON.stringify(mergedEvidence.evidenceReadinessWarnings);
  assert.equal(mergedWarningText.includes(`OC${"="}`), false);
  assert.equal(mergedWarningText.includes("bundle-secret"), false);
  assert.equal(
    mergedEvidence.evidenceReadinessWarnings.some((warning) => warning.code === "VERIFIED_LEGAL_SEARCH_NO_ANSWER_READY"),
    true,
  );

  const legalChangeMergedEvidence = assistantServiceModule.mergeRetrievedAssistantEvidence({
    baseEvidence: [],
    verifiedLegalEvidence: { evidence: [], warnings: [] },
    verifiedLegalSearchEvidence: {
      evidence: [{
        id: "verified-legal-search:law:changed:chunk:1",
        kind: "regulation",
        priority: 2,
        title: "Changed statute evidence",
        excerpt: "Changed statute excerpt",
        recordId: "law:changed",
        legal: {
          sourceId: "law:changed",
          chunkId: "chunk:1",
          sourceKind: "statute",
          authorityRank: "statute",
          stale: false,
          legalChangeWarnings: ["LEGAL_CHANGE_REVIEW_REQUIRED"],
        },
      }],
      warnings: [],
    },
  });
  assert.equal(
    legalChangeMergedEvidence.evidenceReadinessWarnings.some((warning) => warning.code === "VERIFIED_LEGAL_CHANGE_WARNING"),
    true,
  );
  assert.equal(
    legalChangeMergedEvidence.evidenceReadinessWarnings.some((warning) => warning.message.includes("Changed statute evidence")),
    true,
  );
  const duplicateLegalChangeMergedEvidence = assistantServiceModule.mergeRetrievedAssistantEvidence({
    baseEvidence: [],
    verifiedLegalEvidence: { evidence: [], warnings: [] },
    verifiedLegalSearchEvidence: {
      evidence: [
        {
          id: "verified-legal-search:law:changed:chunk:1",
          kind: "regulation",
          priority: 2,
          title: "Changed statute evidence A",
          excerpt: "Changed statute excerpt A",
          recordId: "law:changed",
          legal: {
            sourceId: "law:changed",
            chunkId: "chunk:1",
            sourceKind: "statute",
            authorityRank: "statute",
            stale: false,
            legalChangeWarnings: ["LEGAL_CHANGE_REVIEW_REQUIRED"],
          },
        },
        {
          id: "verified-legal-search:law:changed:chunk:2",
          kind: "regulation",
          priority: 2,
          title: "Changed statute evidence B",
          excerpt: "Changed statute excerpt B",
          recordId: "law:changed",
          legal: {
            sourceId: "law:changed",
            chunkId: "chunk:2",
            sourceKind: "statute",
            authorityRank: "statute",
            stale: false,
            legalChangeWarnings: ["LEGAL_CHANGE_REVIEW_REQUIRED"],
          },
        },
      ],
      warnings: [],
    },
  });
  assert.equal(
    duplicateLegalChangeMergedEvidence.evidenceReadinessWarnings.filter((warning) => warning.code === "VERIFIED_LEGAL_CHANGE_WARNING").length,
    1,
  );
  const mergedAnswerReadyWarning = assistantServiceModule.mergeRetrievedAssistantEvidence({
    baseEvidence: [],
    verifiedLegalEvidence: { evidence: [], warnings: [] },
    verifiedLegalSearchEvidence: answerReadyWarning,
  });
  assert.equal(
    mergedAnswerReadyWarning.evidenceReadinessWarnings.filter((warning) => warning.code === "VERIFIED_LEGAL_CHANGE_WARNING").length,
    1,
  );

  const staleMergedEvidence = assistantServiceModule.mergeRetrievedAssistantEvidence({
    baseEvidence: [],
    verifiedLegalEvidence: {
      evidence: [{
        id: "verified-legal-search:law:stale:chunk:1",
        kind: "regulation",
        priority: 2,
        title: "Stale statute evidence",
        excerpt: "Stale statute excerpt",
        recordId: "law:stale",
        legal: {
          sourceId: "law:stale",
          chunkId: "chunk:1",
          sourceKind: "statute",
          authorityRank: "statute",
          stale: true,
          legalChangeWarnings: [],
        },
      }],
      warnings: [],
    },
    verifiedLegalSearchEvidence: { evidence: [], warnings: [] },
  });
  assert.equal(
    staleMergedEvidence.evidenceReadinessWarnings.some((warning) => warning.code === "VERIFIED_LEGAL_EVIDENCE_STALE"),
    true,
  );

  const httpError = await fetchVerifiedLegalSearchEvidence({
    question: "건축법",
    serviceUrl: "http://legal.local",
    apiSecret: "fixture-legal-api-secret",
    fetchImpl: async () => new Response("nope", { status: 503 }),
  });
  assert.deepEqual(httpError.evidence, []);
  assert.equal(httpError.warnings[0]?.code, "VERIFIED_LEGAL_SEARCH_API_HTTP_ERROR");

  const unreachable = await fetchVerifiedLegalSearchEvidence({
    question: "건축법",
    serviceUrl: "http://legal.local",
    apiSecret: "fixture-legal-api-secret",
    fetchImpl: async () => {
      throw new Error("network down");
    },
  });
  assert.deepEqual(unreachable.evidence, []);
  assert.equal(unreachable.warnings[0]?.code, "VERIFIED_LEGAL_SEARCH_API_UNREACHABLE");

  const invalidUrl = await fetchVerifiedLegalSearchEvidence({
    question: "건축법",
    serviceUrl: "not a url",
    apiSecret: "fixture-legal-api-secret",
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    },
  });
  assert.deepEqual(invalidUrl.evidence, []);
  assert.equal(invalidUrl.warnings[0]?.code, "VERIFIED_LEGAL_SEARCH_API_URL_INVALID");

  const assistantServiceSource = await readFile(join(process.cwd(), "src", "use-cases", "assistant-service.ts"), "utf8");
  assert.match(assistantServiceSource, /fetchVerifiedLegalSearchEvidence/);
  assert.match(assistantServiceSource, /selectLegalSearchContext/);
  assert.match(assistantServiceSource, /const legalSearchContext = selectLegalSearchContext/);
  assert.match(assistantServiceSource, /mergeRetrievedAssistantEvidence/);

  const assistantPromptModule = await import("../src/domains/assistant/saas-api-mode");
  assert.equal(typeof assistantPromptModule.buildAssistantPromptText, "function");
  const promptText = assistantPromptModule.buildAssistantPromptText({
    taskTitle: "Task",
    question: "Question",
    instruction: "Instruction",
    evidence: [],
    evidenceReadinessWarnings: [
      ...noAnswerReady.warnings,
      ...legalChangeMergedEvidence.evidenceReadinessWarnings,
      ...staleMergedEvidence.evidenceReadinessWarnings,
    ],
  });
  assert.match(promptText, /Evidence readiness warnings:/);
  assert.match(promptText, /legal basis was not verified/);
  assert.match(promptText, /LEGAL_CHANGE_REVIEW_REQUIRED/);
  assert.match(promptText, /stale/i);
  const promptWithoutWarnings = assistantPromptModule.buildAssistantPromptText({
    taskTitle: "Task",
    question: "Question",
    instruction: "Instruction",
    evidence: [],
    evidenceReadinessWarnings: [],
  });
  assert.equal(promptWithoutWarnings.endsWith("\n"), false);
  const legalMetadataPrompt = assistantPromptModule.buildAssistantPromptText({
    taskTitle: "Task",
    question: "Question",
    instruction: "Instruction",
    evidence: [mapped.evidence[0]!],
    evidenceReadinessWarnings: [],
  });
  assert.match(legalMetadataPrompt, /source kind: statute/i);
  assert.match(legalMetadataPrompt, /authority rank: statute/i);
  assert.match(legalMetadataPrompt, /effective: 2026-01-01 to 2026-12-31/i);
  assert.match(legalMetadataPrompt, /source locator: .*building-act.*article.*11/i);
  assert.match(legalMetadataPrompt, /confidence reason: Answer-ready verified statute source/i);
  const assistantSaasModeSource = await readFile(join(process.cwd(), "src", "use-cases", "assistant-saas-mode-service.ts"), "utf8");
  assert.match(assistantSaasModeSource, /buildAssistantPromptText/);
  assert.match(assistantSaasModeSource, /evidenceReadinessWarnings:\s*retrieved\.evidenceReadinessWarnings/);
  const assistantSaasModeModule = await import("../src/use-cases/assistant-saas-mode-service");
  assert.equal(typeof assistantSaasModeModule.toAssistantGenerateRetrievalSnapshot, "function");
  const generatedSnapshot = assistantSaasModeModule.toAssistantGenerateRetrievalSnapshot({
    taskContext: {
      taskId: "task:snapshot",
      projectId: "project:snapshot",
      title: "Snapshot task",
      description: "Snapshot description",
      status: "new",
      issueId: "ISSUE-SNAPSHOT",
      projectName: "Snapshot project",
    },
    evidence: legalChangeMergedEvidence.evidence,
    unavailableEvidenceKinds: ["project_document"],
    evidenceReadinessWarnings: legalChangeMergedEvidence.evidenceReadinessWarnings,
  });
  assert.equal(generatedSnapshot.taskContext.taskId, "task:snapshot");
  assert.equal(generatedSnapshot.evidence[0]?.id, legalChangeMergedEvidence.evidence[0]?.id);
  assert.equal(generatedSnapshot.evidenceReadinessWarnings[0]?.code, "VERIFIED_LEGAL_CHANGE_WARNING");
  assert.match(assistantSaasModeSource, /const promptEvidence = retrieved\.evidence\.slice\(0,\s*10\)/);
  assert.match(assistantSaasModeSource, /buildAssistantPromptText\(\{[\s\S]*?evidence:\s*promptEvidence/);
  assert.match(assistantSaasModeSource, /evidenceIds:\s*promptEvidence\.map/);
  assert.match(assistantSaasModeSource, /promptText:\s*promptText/);
  assert.match(assistantSaasModeSource, /runProviderOrRecordFailure\(\{[\s\S]*?evidence:\s*promptEvidence/);
  assert.match(assistantSaasModeSource, /const retrievalSnapshot = toAssistantGenerateRetrievalSnapshot\(\{[\s\S]*?evidence:\s*promptEvidence/);
  assert.match(assistantSaasModeSource, /retrieval:\s*retrievalSnapshot/);
  assert.doesNotMatch(assistantSaasModeSource, /retrieval:\s*toAssistantGenerateRetrievalSnapshot\(retrieved\)/);

  const taskAssistantPanelSource = await readFile(join(process.cwd(), "src", "components", "tasks", "task-assistant-panel.tsx"), "utf8");
  assert.match(taskAssistantPanelSource, /evidenceReadinessWarnings:\s*verifiedRetrieval\.evidenceReadinessWarnings/);
  assert.match(taskAssistantPanelSource, /evidenceReadinessWarnings:\s*retrieval\.evidenceReadinessWarnings/);
  assert.match(taskAssistantPanelSource, /projectContextChunks:\s*retrieval\.projectContextChunks/);
  assert.match(taskAssistantPanelSource, /projectContextTrace:\s*retrieval\.projectContextTrace/);
  assert.match(taskAssistantPanelSource, /formatEvidenceReadinessWarningsForAssistant/);
  assert.match(taskAssistantPanelSource, /retrieval:\s*RetrieveResponse/);
  assert.match(taskAssistantPanelSource, /const reviewRequestSeqRef = useRef\(0\)/);
  assert.match(taskAssistantPanelSource, /const requestedTaskId = selectedTask\.id/);
  assert.match(taskAssistantPanelSource, /reviewRequestSeqRef\.current !== reviewRequestId/);
  assert.match(taskAssistantPanelSource, /requestedExecutionMode === "saas-api"/);
  assert.match(taskAssistantPanelSource, /postTaskReviewJson\(\{[\s\S]*?mode:\s*"generate"/);
  assert.match(taskAssistantPanelSource, /normalizeGeneratedRetrieval\(review\.generated\?\.retrieval\)\s*\?\?/);
  assert.match(taskAssistantPanelSource, /setRecord\(review\.savedRecord\)/);
  assert.match(taskAssistantPanelSource, /const retrieveForRecord = generated\.retrieval \?\? verifiedRetrieval/);
  assert.doesNotMatch(taskAssistantPanelSource, /postJson<AssistantGenerateResponse>\("\/api\/assistant\/generate"/);
  assert.doesNotMatch(taskAssistantPanelSource, /appendLegalChangeReviewNotice\(generated\.answer,\s*generated\.retrieval\)/);
  assert.match(taskAssistantPanelSource, /retrieveForRecord\.taskContext\.taskId !== requestedTaskId/);
  assert.match(taskAssistantPanelSource, /refreshAssistantRecords\(retrieveForRecord\.taskContext\.taskId,\s*reviewRequestId\)/);
  assert.match(taskAssistantPanelSource, /async function refreshAssistantRecords\(taskId: string,\s*reviewRequestId\?: number\)/);
  const refreshAssistantRecordsBlock =
    /async function refreshAssistantRecords\(taskId: string,\s*reviewRequestId\?: number\) \{[\s\S]*?\n  \}/.exec(taskAssistantPanelSource)?.[0] ?? "";
  assert.match(refreshAssistantRecordsBlock, /if \(reviewRequestId !== undefined && reviewRequestSeqRef\.current !== reviewRequestId\)/);
  assert.match(
    refreshAssistantRecordsBlock,
    /if \(reviewRequestId !== undefined && reviewRequestSeqRef\.current !== reviewRequestId\) \{[\s\S]*?return;[\s\S]*?\}\s*setRecordHistory\(items\);/,
  );
  assert.match(
    refreshAssistantRecordsBlock,
    /if \(reviewRequestId === undefined \|\| reviewRequestSeqRef\.current === reviewRequestId\) \{[\s\S]*?setStatus\(errorMessage\(error\)\);[\s\S]*?\}/,
  );
  assert.match(
    refreshAssistantRecordsBlock,
    /if \(reviewRequestId === undefined \|\| reviewRequestSeqRef\.current === reviewRequestId\) \{[\s\S]*?setRecordHistoryLoading\(false\);[\s\S]*?\}/,
  );
  assert.match(taskAssistantPanelSource, /setRetrieveResult\(retrieveForRecord\)/);
  assert.match(taskAssistantPanelSource, /evidence:\s*retrieveForRecord\.evidence/);
  const retrieveRouteSource = await readFile(join(process.cwd(), "src", "app", "api", "assistant", "retrieve", "route.ts"), "utf8");
  assert.match(retrieveRouteSource, /taskId:\s*String\(body\.taskId/);
  assert.match(retrieveRouteSource, /question:\s*String\(body\.question/);
  assert.doesNotMatch(retrieveRouteSource, /body\.(?:sourceIds|diagnosticMode|authority|serviceUrl|evidence)\b/);
  const generateRouteSource = await readFile(join(process.cwd(), "src", "app", "api", "assistant", "generate", "route.ts"), "utf8");
  assert.doesNotMatch(generateRouteSource, /body\.(?:sourceIds|diagnosticMode|authority|serviceUrl|evidence)\b/);
  const generateInputBlock = /type GenerateAssistantInput = \{[\s\S]*?\};/.exec(assistantSaasModeSource)?.[0] ?? "";
  assert.match(generateInputBlock, /taskId/);
  assert.match(generateInputBlock, /question/);
  assert.match(generateInputBlock, /instruction/);
  assert.doesNotMatch(generateInputBlock, /evidence|sourceIds|diagnosticMode|authority|serviceUrl/);

  console.log(JSON.stringify({ status: "legal-search-adapter-pass", cases: 75 }));
}

main();

function restoreEnv(name: string, previousValue: string | undefined): void {
  if (previousValue === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = previousValue;
}
