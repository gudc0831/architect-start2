import type { AssistantDraftSummary, AssistantEvidence } from "@/domains/assistant/types";
import type { AssistantRunPolicy } from "@/domains/assistant/saas-api-mode";

export type AssistantProviderCallMode = "mock" | "live";

export type AssistantProviderResult = {
  answer: string;
  suggestedDraftSummary: AssistantDraftSummary;
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
  callMode: AssistantProviderCallMode;
  providerRequestId: string | null;
  metadata: Record<string, unknown>;
};

type ProviderInput = {
  policy: AssistantRunPolicy;
  taskLabel: string;
  question: string;
  instruction: string;
  promptText: string;
  evidence: AssistantEvidence[];
  estimatedInputTokens: number;
  requestHash: string;
};

type OpenAIResponsePayload = {
  id?: unknown;
  output_text?: unknown;
  output?: unknown;
  usage?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
    total_tokens?: unknown;
  };
  error?: {
    code?: unknown;
    message?: unknown;
  } | null;
};

export class AssistantProviderError extends Error {
  readonly code: string;
  readonly status: number;
  readonly metadata: Record<string, unknown>;

  constructor(message: string, code: string, metadata: Record<string, unknown> = {}, status = 503) {
    super(message);
    this.name = "AssistantProviderError";
    this.code = code;
    this.status = status;
    this.metadata = metadata;
  }
}

export async function runAssistantProvider(input: ProviderInput): Promise<AssistantProviderResult> {
  if (input.policy.provider === "openai") {
    return runOpenAIProvider(input);
  }

  return runMockProvider(input);
}

function runMockProvider(input: ProviderInput): AssistantProviderResult {
  const answer = buildDeterministicAnswer(input);
  const suggestedDraftSummary = buildSuggestedSummary({
    taskLabel: input.taskLabel,
    evidence: input.evidence,
    provider: "mock",
  });
  const outputTokens = Math.min(
    estimateTokens(`${answer}\n${JSON.stringify(suggestedDraftSummary)}`),
    input.policy.maxOutputTokens,
  );

  return {
    answer,
    suggestedDraftSummary,
    inputTokens: input.estimatedInputTokens,
    outputTokens,
    estimatedCostCents: estimateCostCents(input.estimatedInputTokens, outputTokens),
    callMode: "mock",
    providerRequestId: null,
    metadata: {
      providerCall: "mock_deterministic_response",
    },
  };
}

async function runOpenAIProvider(input: ProviderInput): Promise<AssistantProviderResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AssistantProviderError(
      "SaaS API provider is not configured. Set OPENAI_API_KEY on the server.",
      "ASSISTANT_PROVIDER_NOT_CONFIGURED",
      { provider: "openai", model: input.policy.model },
    );
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.policy.model,
      instructions: buildOpenAIInstructions(input.instruction),
      input: input.promptText,
      max_output_tokens: input.policy.maxOutputTokens,
      store: false,
      metadata: {
        project_id: input.policy.projectId,
        request_hash: input.requestHash,
      },
    }),
  });

  const payload = (await safeJson(response)) as OpenAIResponsePayload;
  if (!response.ok) {
    throw new AssistantProviderError(
      "OpenAI provider request failed.",
      "ASSISTANT_PROVIDER_REQUEST_FAILED",
      {
        provider: "openai",
        model: input.policy.model,
        providerStatus: response.status,
        providerErrorCode: typeof payload.error?.code === "string" ? payload.error.code : null,
      },
      503,
    );
  }

  const answer = extractOutputText(payload).trim();
  if (!answer) {
    throw new AssistantProviderError(
      "OpenAI provider returned an empty response.",
      "ASSISTANT_PROVIDER_EMPTY_RESPONSE",
      { provider: "openai", model: input.policy.model, providerRequestId: typeof payload.id === "string" ? payload.id : null },
    );
  }

  const inputTokens = normalizeTokenCount(payload.usage?.input_tokens, input.estimatedInputTokens);
  const outputTokens = normalizeTokenCount(payload.usage?.output_tokens, estimateTokens(answer));

  return {
    answer,
    suggestedDraftSummary: buildSuggestedSummary({
      taskLabel: input.taskLabel,
      evidence: input.evidence,
      provider: "openai",
    }),
    inputTokens,
    outputTokens,
    estimatedCostCents: estimateCostCents(inputTokens, outputTokens),
    callMode: "live",
    providerRequestId: typeof payload.id === "string" ? payload.id : null,
    metadata: {
      providerCall: "openai_responses_api",
      providerRequestId: typeof payload.id === "string" ? payload.id : null,
      usageTotalTokens: normalizeOptionalNumber(payload.usage?.total_tokens),
    },
  };
}

function buildOpenAIInstructions(instruction: string) {
  return [
    "You are an architecture task assistant for Korean construction and design coordination work.",
    "Answer in Korean. Separate evidence, opinion, risk, and follow-up actions.",
    "Do not treat the generated answer as a final legal, permit, or design decision.",
    instruction,
  ].join("\n");
}

function buildDeterministicAnswer(input: Pick<ProviderInput, "taskLabel" | "question" | "instruction" | "evidence">) {
  const primary = input.evidence[0];
  const external = input.evidence.find((item) => item.kind === "web_or_skill");
  const regulation = input.evidence.find((item) => item.kind === "regulation");
  const projectDocument = input.evidence.find((item) => item.kind === "project_document");

  return [
    `${input.taskLabel} task를 SaaS API Mode mock provider로 검토했습니다.`,
    `질문: ${input.question}`,
    `지침: ${input.instruction}`,
    primary ? `주요 근거: ${primary.title} - ${primary.excerpt}` : "주요 근거: 현재 연결된 근거가 부족합니다.",
    regulation ? `법규 근거 확인: ${regulation.title} - ${regulation.excerpt}` : null,
    projectDocument ? `문서 근거 확인: ${projectDocument.title} - ${projectDocument.excerpt}` : null,
    external ? `외부 근거 확인: ${external.title} - ${external.excerpt}` : null,
    "의견: 이 응답은 provider adapter 검증용 deterministic 응답입니다. 공식 결론으로 반영하기 전 도면, 기준 문서, 담당자 협의를 확인하세요.",
    "후속 조치: 부족한 근거를 보강하고, 확인 책임자와 기한이 필요한 항목은 별도 follow-up task로 분리하세요.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildSuggestedSummary(input: { taskLabel: string; evidence: AssistantEvidence[]; provider: "mock" | "openai" }): AssistantDraftSummary {
  const primary = input.evidence[0];

  return {
    conclusion: primary
      ? `SaaS API Mode ${input.provider} provider가 연결된 task/project 근거를 기준으로 후속 확인 필요 의견을 생성했습니다.`
      : "근거 보강 후 SaaS API Mode assistant 재검토가 필요합니다.",
    tags: ["assistant", "saas-api", "건축검토"],
    scope: input.taskLabel,
    followUpAction: "근거 문서와 담당자 확인 후 task 기록에 반영하세요.",
  };
}

function extractOutputText(payload: OpenAIResponsePayload) {
  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }

  if (!Array.isArray(payload.output)) {
    return "";
  }

  const chunks: string[] = [];
  for (const outputItem of payload.output) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) {
      continue;
    }

    for (const contentItem of outputItem.content) {
      if (isRecord(contentItem) && contentItem.type === "output_text" && typeof contentItem.text === "string") {
        chunks.push(contentItem.text);
      }
    }
  }

  return chunks.join("\n\n");
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateCostCents(inputTokens: number, outputTokens: number) {
  if (inputTokens + outputTokens <= 0) {
    return 0;
  }

  return Math.max(1, Math.ceil((inputTokens + outputTokens * 3) / 1000));
}

function normalizeTokenCount(value: unknown, fallback: number) {
  const normalized = normalizeOptionalNumber(value);
  return normalized && normalized > 0 ? Math.round(normalized) : fallback;
}

function normalizeOptionalNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
