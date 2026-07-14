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

export const ResumeScoreAnalysisSchema = z.object({
  score: z.number().finite().default(0),
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
