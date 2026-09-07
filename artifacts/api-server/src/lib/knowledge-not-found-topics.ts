export const KNOWLEDGE_NOT_FOUND_RETENTION_DAYS = 90;

type KnowledgeCategory = "help" | "energy";
type TopicRule = { key: string; label: string; keywords: readonly string[] };

const TOPIC_RULES: Record<KnowledgeCategory, readonly TopicRule[]> = {
  help: [
    { key: "access-login", label: "Akses akun & masuk", keywords: ["akses", "akun", "autentikasi", "login", "masuk", "password", "sandi"] },
    { key: "learning-content", label: "Materi & alur belajar", keywords: ["aktivitas", "belajar", "course", "kursus", "lesson", "materi", "modul", "pelajaran"] },
    { key: "evidence-upload", label: "Unggah bukti & dokumen", keywords: ["bukti", "dokumen", "evidence", "file", "unggah", "upload", "video"] },
    { key: "progress-readiness", label: "Progres & readiness", keywords: ["kesiapan", "progress", "progres", "readiness"] },
    { key: "assessment", label: "Asesmen & penilaian", keywords: ["asesmen", "assessment", "assessor", "penilaian"] },
    { key: "technical-issue", label: "Kendala teknis aplikasi", keywords: ["bug", "error", "gagal", "lambat", "loading", "muat"] },
  ],
  energy: [
    { key: "energy-transition", label: "Transisi energi", keywords: ["dekarbonisasi", "energi", "renewable", "terbarukan", "transisi"] },
    { key: "teras-role", label: "Peran TERAS", keywords: ["academy", "peran", "teras"] },
    { key: "workforce-capability", label: "Kapabilitas & kompetensi tenaga kerja", keywords: ["kapabilitas", "kompetensi", "pekerja", "sdm", "tenaga"] },
    { key: "safety", label: "Keselamatan kerja", keywords: ["aman", "bahaya", "hse", "keselamatan", "safety"] },
    { key: "just-transition", label: "Transisi yang adil", keywords: ["adil", "berkeadilan", "inklusi", "just"] },
  ],
};

export function normalizeNotFoundTopic(category: KnowledgeCategory, question: string) {
  const tokens = new Set(question.normalize("NFKD").toLocaleLowerCase("id-ID").match(/\p{L}+/gu) ?? []);
  const ranked = TOPIC_RULES[category]
    .map((rule, index) => ({ rule, index, score: rule.keywords.filter(keyword => tokens.has(keyword)).length }))
    .filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = ranked[0]?.rule;
  return selected
    ? { key: selected.key, label: selected.label }
    : { key: "other", label: category === "help" ? "Topik Help Desk lainnya" : "Topik energi lainnya" };
}