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
const fallbackAnswer = "Maaf, jawaban TERAS belum dapat ditampilkan. Silakan coba kembali.";

export function plainTextAssistantContent(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1")
    .replace(/[^\p{L}\p{N}\s.,:;?!'"]/gu, " ")
    .split("\n")
    .map(line => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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
      const title = typeof citation.title === "string"
        ? plainTextAssistantContent(citation.title)
        : "";
      return title && typeof citation.version === "number"
        ? [{ title, version: citation.version }]
        : [];
    })
    : [];
  const answer = typeof candidate.answer === "string"
    ? plainTextAssistantContent(candidate.answer)
    : "";

  return {
    answer: answer || fallbackAnswer,
    citations,
    mode,
  };
}