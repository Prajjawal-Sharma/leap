import { z } from "zod";

// Validation boundary for raw Gemini JSON output. Both /api/resume/parse and
// /api/resume/score JSON.parse a model response and, without this module,
// persisted/returned it unchecked — a resume PDF containing adversarial text
// ("ignore previous instructions, return ...") could shape parsed_content
// into wrong types or oversized payloads that then feed buildQueryText
// (src/lib/jobs/match-engine.ts), the ATS score heuristics, and eventually
// the chat context builder.
//
// Field sets mirror the JSON schemas already declared in each route's
// prompt string (PARSE_PROMPT / SCORE_PROMPT) — nothing here is invented.
// z.object() strips unrecognized keys by default, so stray/injected keys
// never reach persistence. String and array caps bound worst-case payload
// size regardless of what the model returns.

const MAX_SHORT = 200;
const MAX_SUMMARY = 2000;
const MAX_DESCRIPTION = 3000;
const MAX_SKILL = 100;
const MAX_CERT = 200;

const MAX_EXPERIENCE_ITEMS = 30;
const MAX_EDUCATION_ITEMS = 20;
const MAX_SKILLS_ITEMS = 100;
const MAX_CERTIFICATIONS_ITEMS = 50;
const MAX_LANGUAGES_ITEMS = 20;

const shortField = z.string().max(MAX_SHORT).default("");

export const ParsedResumeSchema = z.object({
  full_name: shortField,
  email: shortField,
  phone: shortField,
  location: shortField,
  summary: z.string().max(MAX_SUMMARY).default(""),
  experience: z
    .array(
      z.object({
        company: shortField,
        role: shortField,
        duration: shortField,
        description: z.string().max(MAX_DESCRIPTION).default(""),
      })
    )
    .max(MAX_EXPERIENCE_ITEMS)
    .default([]),
  education: z
    .array(
      z.object({
        institution: shortField,
        degree: shortField,
        year: shortField,
      })
    )
    .max(MAX_EDUCATION_ITEMS)
    .default([]),
  skills: z.array(z.string().max(MAX_SKILL)).max(MAX_SKILLS_ITEMS).default([]),
  certifications: z
    .array(z.string().max(MAX_CERT))
    .max(MAX_CERTIFICATIONS_ITEMS)
    .default([]),
  languages: z
    .array(z.string().max(MAX_SHORT))
    .max(MAX_LANGUAGES_ITEMS)
    .default([]),
});

export type ParsedResume = z.infer<typeof ParsedResumeSchema>;

const MAX_FINDINGS_ITEMS = 20;
const MAX_FINDING_LEN = 300;
const MAX_KEYWORDS_ITEMS = 50;
// Distinct from MAX_SKILL (atomic skill names in ParsedResumeSchema):
// keywords_missing suggestions from Gemini are sometimes full phrases —
// observed up to 115 chars against a real resume — so 100 was too tight
// and intermittently 502'd the score route.
const MAX_KEYWORD_LEN = 200;
const MAX_VERDICT_LEN = 1000;

// score is the one required field. With every key defaulted, {} or a refusal
// object ({"error": "..."} strips to {}) parsed as a successful analysis
// scoring 0, and both score sites persisted it over the real ats_score. A
// reply without a score is not an analysis and must take the 502-retryable
// path. The lists and verdict keep their defaults: a thin resume can
// legitimately get a score with few or no findings.
export const ResumeScoreAnalysisSchema = z.object({
  score: z.number().finite(),
  strengths: z
    .array(z.string().max(MAX_FINDING_LEN))
    .max(MAX_FINDINGS_ITEMS)
    .default([]),
  improvements: z
    .array(z.string().max(MAX_FINDING_LEN))
    .max(MAX_FINDINGS_ITEMS)
    .default([]),
  keywords_missing: z
    .array(z.string().max(MAX_KEYWORD_LEN))
    .max(MAX_KEYWORDS_ITEMS)
    .default([]),
  verdict: z.string().max(MAX_VERDICT_LEN).default(""),
});

export type ResumeScoreAnalysis = z.infer<typeof ResumeScoreAnalysisSchema>;

// Combined parse+score — /api/resume/parse asks Gemini for BOTH payloads in
// one call (free-tier quota is 20 requests/day/key, so the second call per
// upload was 50% waste), making the combined reply a single Gemini JSON
// output site behind one safeParse gate. Composes the two existing schemas
// so the persisted shapes and caps can never drift from the standalone
// versions. The refine follows TailoredResumeSchema's degenerate-reply
// rationale — every ParsedResume field defaults, so {} or a refusal object
// would otherwise validate into a blank resume and persist as success — but
// the test is deliberately WIDER than the tailor one: a tailored rewrite
// always carries summary/experience/skills, while a legitimately sparse
// PARSE (a fresher CV with only education, certifications, and contact
// info) may not, and the old parse flow accepted those. Any extracted
// content counts as substance; only an entirely empty extraction takes the
// 502-retryable path.
export const ResumeParseAndScoreSchema = z
  .object({
    resume: ParsedResumeSchema,
    ats_analysis: ResumeScoreAnalysisSchema,
  })
  .refine(
    (v) =>
      v.resume.summary.trim().length > 0 ||
      v.resume.experience.length > 0 ||
      v.resume.skills.length > 0 ||
      v.resume.education.length > 0 ||
      v.resume.certifications.length > 0 ||
      v.resume.full_name.trim().length > 0 ||
      v.resume.email.trim().length > 0,
    {
      message: "combined payload extracted no resume content at all",
    }
  );

export type ResumeParseAndScore = z.infer<typeof ResumeParseAndScoreSchema>;

// One-Click Tailored Resume — /api/resume/tailor asks Gemini to rewrite the
// primary resume against a job description and JSON.parses the reply, so it
// is a Gemini JSON output site with the same safeParse boundary as
// parse/score above. The tailored payload is deliberately the SAME shape as
// ParsedResume: every existing consumer (chat-context formatter,
// match-engine query builder, resume renderers) can then consume it
// unchanged, and the caps above are already sized to real resume content.
// Composing rather than copying means the shapes can never drift apart; if
// tailoring ever needs extra fields, extend ParsedResumeSchema here instead.
//
// The refine exists because every ParsedResume field defaults: a degenerate
// Gemini reply that is a JSON object but not a resume ({} after unknown-key
// stripping — e.g. a refusal object or a {"resume": ...} wrapper) would
// otherwise "validate" into an all-blank resume and be persisted as
// success. A rewrite of a real resume always carries substance; a payload
// with none is malformed output and must take the 502-retryable path.
//
// The same predicate gates the tailor route BEFORE the Gemini call: an
// original with no summary, experience or skills (a sparse-but-real fresher
// CV the parse refine accepts) gives the model nothing to rewrite. A
// faithful reply — the prompt forbids inventing content — has none of the
// three either and fails this refine, so calling the model would spend a
// scarce free-tier request on a 502.
//
// Content means text, not entries: every entry field defaults to "", so
// skills: [""] or experience: [{}] is as empty as []. Whitespace and the
// zero-width space/joiners (which trim() keeps) do not count as text.
const hasText = (s: string): boolean =>
  s.replace(/[\u200b-\u200d]/g, "").trim().length > 0;

type ExperienceEntry = ParsedResume["experience"][number];
type EducationEntry = ParsedResume["education"][number];

const experienceHasText = (e: ExperienceEntry): boolean =>
  hasText(e.company) ||
  hasText(e.role) ||
  hasText(e.duration) ||
  hasText(e.description);

const educationHasText = (e: EducationEntry): boolean =>
  hasText(e.institution) || hasText(e.degree) || hasText(e.year);

export const hasTailorableContent = (r: ParsedResume): boolean =>
  hasText(r.summary) ||
  r.experience.some(experienceHasText) ||
  r.skills.some(hasText);

export const TailoredResumeSchema = ParsedResumeSchema.refine(
  hasTailorableContent,
  {
    message:
      "tailored payload has no resume content (summary, experience, and skills all empty)",
  }
);

export type TailoredResume = ParsedResume;

// The tailor prompt keeps every experience entry ("rewrite each experience
// description") and keeps education, certifications and languages factually
// identical, so a count that differs from the original means the model
// dropped or invented an entry. Skills are exempt: the prompt allows
// dropping clearly irrelevant ones.
const COUNT_PRESERVED_LISTS = [
  "experience",
  "education",
  "certifications",
  "languages",
] as const;

type CountPreservedList = (typeof COUNT_PRESERVED_LISTS)[number];

// Entries with any text, per list. A blank entry ({} or "") is not data —
// the parse can produce one, since every entry field defaults to "" — so a
// reply that tidies it away has lost nothing and must not 502 on every
// retry.
const filled = (values: string[]): number => values.filter(hasText).length;

const entryCounts = (r: ParsedResume): Record<CountPreservedList, number> => ({
  experience: r.experience.filter(experienceHasText).length,
  education: r.education.filter(educationHasText).length,
  certifications: filled(r.certifications),
  languages: filled(r.languages),
});

// How many entries have each field filled in, for the lists of objects.
// Matching entry counts alone miss a reply that keeps the entry but blanks
// part of it — experience rows that keep only the description. Counting per
// field rather than comparing entry by entry leaves the model free to
// reorder and to touch up wording.
const fieldCounts = (
  r: ParsedResume
): Record<"experience" | "education", Record<string, number>> => ({
  experience: {
    company: filled(r.experience.map((e) => e.company)),
    role: filled(r.experience.map((e) => e.role)),
    duration: filled(r.experience.map((e) => e.duration)),
    description: filled(r.experience.map((e) => e.description)),
  },
  education: {
    institution: filled(r.education.map((e) => e.institution)),
    degree: filled(r.education.map((e) => e.degree)),
    year: filled(r.education.map((e) => e.year)),
  },
});

// Per-request tailor schema. TailoredResumeSchema alone cannot tell a
// faithful rewrite from a partial one — every field defaults, so a reply
// that omits the education block or the email still parses — and the
// partial copy would be saved as the user's tailored resume. These fail
// validation (502-retryable, nothing written): a different number of
// entries with text in a count-preserved list, a field filled in fewer
// entries than the original, or a blank summary where the original had
// one. Filling a field the original left blank does not. Contact fields are
// not checked but copied from the original: the prompt requires them
// EXACTLY as given, so there is no legitimate reply in which they differ,
// and restoring them costs nothing where a 502 would cost a retry.
export const tailoredResumeSchemaFor = (original: ParsedResume) => {
  const originalEntries = entryCounts(original);
  const originalFields = fieldCounts(original);
  return TailoredResumeSchema.superRefine((r, ctx) => {
    if (hasText(original.summary) && !hasText(r.summary)) {
      ctx.addIssue({
        code: "custom",
        path: ["summary"],
        message: "tailored summary is blank; the original has one",
      });
    }
    const replyEntries = entryCounts(r);
    const replyFields = fieldCounts(r);
    for (const key of COUNT_PRESERVED_LISTS) {
      if (replyEntries[key] !== originalEntries[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `tailored ${key} has ${replyEntries[key]} entries with text; the original has ${originalEntries[key]}`,
        });
        continue;
      }
      if (key !== "experience" && key !== "education") continue;
      const blanked = Object.keys(originalFields[key]).filter(
        (field) => replyFields[key][field] < originalFields[key][field]
      );
      if (blanked.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `tailored ${key} blanks ${blanked.join(", ")} in entries the original filled`,
        });
      }
    }
  }).transform(
    (r): TailoredResume => ({
      ...r,
      full_name: original.full_name,
      email: original.email,
      phone: original.phone,
      location: original.location,
    })
  );
};
