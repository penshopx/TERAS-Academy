export type AssistantAnswerMode = "ai" | "knowledge_fallback" | "not_found";

export type AssistantCitation = {
  title: string;
  version: number;
};

export type NormalizedAssistantResponse = {
  answer: string;
  citations: AssistantCitation[];
  mode: AssistantAnswerMode;
};

const validModes = new Set<AssistantAnswerMode>(["ai", "knowledge_fallback", "not_found"]);

export function normalizeAssistantResponse(value: unknown): NormalizedAssistantResponse {
  const candidate = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const mode = typeof candidate.mode === "string" && validModes.has(candidate.mode as AssistantAnswerMode)
    ? candidate.mode as AssistantAnswerMode
    : "knowledge_fallback";
  const citations = Array.isArray(candidate.citations)
    ? candidate.citations.flatMap(item => {
      if (!item || typeof item !== "object") return [];
      const citation = item as Record<string, unknown>;
      return typeof citation.title === "string" && typeof citation.version === "number"
        ? [{ title: citation.title, version: citation.version }]
        : [];
    })
    : [];

  return {
    answer: typeof candidate.answer === "string" && candidate.answer.trim()
      ? candidate.answer
      : "Maaf, jawaban TERAS belum dapat ditampilkan. Silakan coba kembali.",
    citations,
    mode,
  };
}