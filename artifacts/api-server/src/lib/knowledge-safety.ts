export function isUnsafeKnowledgeInput(value: string) {
  return /ignore\s+(all\s+)?previous|system\s+prompt|reveal\s+(the\s+)?(prompt|secret)|<script|javascript:|data:/i.test(value);
}
export function hasUnsafeKnowledgeLink(value: string) {
  return /(?:javascript|data|file|vbscript):/i.test(value);
}
export function withReadinessDisclaimer(value: string) {
  return `${value.trim()}\n\nCatatan TERAS: informasi ini mendukung kesiapan belajar/praktik internal, bukan keputusan kompeten atau sertifikasi resmi.`;
}