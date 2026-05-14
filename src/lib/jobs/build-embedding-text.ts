// gemini-embedding-001 supports ~2048 input tokens (~8k chars in English);
// the predecessor text-embedding-004 was shut down 2026-01-14. Cap the
// description to leave headroom for the structural fields and apply a final
// ceiling on the whole composed string.
const DESCRIPTION_CHAR_CAP = 2000;
const TOTAL_CHAR_CAP = 8000;

export type EmbeddableJobFields = {
  title: string | null | undefined;
  company: string | null | undefined;
  location: string | null | undefined;
  description: string | null | undefined;
  requirements: string | null | undefined;
  is_remote: boolean | null | undefined;
  employment_type: string | null | undefined;
};

const truncate = (s: string, cap: number) =>
  s.length > cap ? s.slice(0, cap) : s;

const cleanField = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").trim();

export function buildJobEmbeddingText(job: EmbeddableJobFields): string {
  const title = cleanField(job.title);
  const company = cleanField(job.company);
  const location = cleanField(job.location);
  const employmentType = cleanField(job.employment_type);
  const description = (job.description ?? "").trim();
  const requirements = cleanField(job.requirements);

  const locationLine =
    (location.length > 0 ? location : "Not specified") +
    (job.is_remote ? " (Remote)" : "");

  const lines: string[] = [
    `Title: ${title}`,
    `Company: ${company}`,
    `Location: ${locationLine}`,
    `Employment Type: ${employmentType.length > 0 ? employmentType : "Not specified"}`,
    `Description: ${description.length > 0 ? truncate(description, DESCRIPTION_CHAR_CAP) : ""}`,
    `Requirements: ${requirements.length > 0 ? requirements : "See description"}`,
  ];

  return truncate(lines.join("\n"), TOTAL_CHAR_CAP);
}

// A job is embeddable if it has at least a title or a description with real
// content. Without either, the embedding would be ~all the same boilerplate
// labels and would dominate similarity rankings.
export function isJobEmbeddable(job: EmbeddableJobFields): boolean {
  return cleanField(job.title).length > 0 || (job.description ?? "").trim().length > 0;
}
