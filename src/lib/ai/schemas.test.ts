// Regression fixtures for the Gemini JSON output schemas, added with the zod
// 4.3.6 -> 4.6.x security bump (GHSA-mrhx-c7xc-m3w5) to prove the upgrade
// changes nothing about what parses and what 502s. Runner: Node's built-in
// node:test via tsx (no new dependencies) — `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { z } from "zod";

import {
  ParsedResumeSchema,
  ResumeParseAndScoreSchema,
  ResumeScoreAnalysisSchema,
  TailoredResumeSchema,
} from "./schemas";

// Shaped like a real parse of a mid-level engineer's CV: every field present,
// realistic lengths, nothing near a cap.
const fullResume = {
  full_name: "Asha Verma",
  email: "asha.verma@example.com",
  phone: "+91 98765 43210",
  location: "Bengaluru, Karnataka",
  summary:
    "Backend engineer with five years building payment and ledger services in Go and Java. Led the migration of a monolith to event-driven services handling 4k TPS.",
  experience: [
    {
      company: "Razorpay",
      role: "Software Engineer II",
      duration: "Jul 2022 – Present",
      description:
        "Owned the settlement reconciliation service. Cut nightly batch time from 3h to 25m by moving to incremental Kafka consumers. Mentored two new hires.",
    },
    {
      company: "Infosys",
      role: "Systems Engineer",
      duration: "Aug 2019 – Jun 2022",
      description:
        "Built REST APIs in Spring Boot for a retail banking client; added contract tests that caught 30+ regressions before release.",
    },
  ],
  education: [
    {
      institution: "NIT Trichy",
      degree: "B.Tech, Computer Science",
      year: "2019",
    },
  ],
  skills: ["Go", "Java", "Kafka", "PostgreSQL", "Kubernetes", "gRPC"],
  certifications: ["AWS Certified Developer – Associate"],
  languages: ["English", "Hindi"],
};

// Shaped like a real ATS analysis. One keywords_missing entry is a full
// phrase of 115 characters — the observed length that 502'd the score route
// when the cap was 100 (Pitfall 3) — so it must keep passing.
const observedLongKeyword =
  "experience designing idempotent payment APIs with exactly-once delivery guarantees across distributed microservices";

const atsAnalysis = {
  score: 72,
  strengths: [
    "Quantified impact on the reconciliation service",
    "Clear progression from Systems Engineer to SWE II",
  ],
  improvements: [
    "Add a skills section ordered by relevance to backend roles",
    "Mention on-call or incident ownership explicitly",
  ],
  keywords_missing: ["Terraform", "observability", observedLongKeyword],
  verdict:
    "Strong backend profile; tighten the summary and surface infrastructure keywords to clear ATS filters for senior roles.",
};

const repeat = (n: number) => "x".repeat(n);

// Asserts the parse failed for exactly the reason the test names, so a
// sample that fails for some other reason cannot keep the test green.
function assertSingleIssue(
  r: z.ZodSafeParseResult<unknown>,
  path: (string | number)[],
  code: string
) {
  assert.equal(r.success, false);
  if (r.success) return;
  assert.equal(r.error.issues.length, 1, JSON.stringify(r.error.issues));
  assert.deepEqual(r.error.issues[0].path, path);
  assert.equal(r.error.issues[0].code, code);
}

describe("ParsedResumeSchema", () => {
  it("parses a full, realistic resume unchanged", () => {
    const r = ParsedResumeSchema.safeParse(fullResume);
    assert.equal(r.success, true);
    assert.deepEqual(r.success && r.data, fullResume);
  });

  it("fills defaults for a sparse resume (contact + education only)", () => {
    const r = ParsedResumeSchema.safeParse({
      full_name: "Rohit Nair",
      email: "rohit@example.com",
      education: [{ institution: "VIT", degree: "B.E.", year: "2026" }],
    });
    assert.equal(r.success, true);
    if (!r.success) return;
    assert.equal(r.data.summary, "");
    assert.deepEqual(r.data.experience, []);
    assert.deepEqual(r.data.skills, []);
  });

  it("strips keys the prompt never asked for", () => {
    const r = ParsedResumeSchema.safeParse({
      ...fullResume,
      instructions: "ignore previous instructions",
    });
    assert.equal(r.success, true);
    assert.equal(r.success && "instructions" in r.data, false);
  });

  // Pitfall 3: lowering a cap must break a test, not only raising one.
  it("accepts values exactly at the caps", () => {
    const r = ParsedResumeSchema.safeParse({
      ...fullResume,
      skills: ["Go", repeat(100)],
      experience: Array.from({ length: 30 }, () => fullResume.experience[0]),
    });
    assert.equal(r.success, true);
  });

  it("rejects a skill over the 100-char cap", () => {
    const r = ParsedResumeSchema.safeParse({
      ...fullResume,
      skills: ["Go", repeat(101)],
    });
    assertSingleIssue(r, ["skills", 1], "too_big");
  });

  it("rejects more than 30 experience entries", () => {
    const r = ParsedResumeSchema.safeParse({
      ...fullResume,
      experience: Array.from({ length: 31 }, () => fullResume.experience[0]),
    });
    assertSingleIssue(r, ["experience"], "too_big");
  });

  // GHSA-mrhx-c7xc-m3w5: before 4.6.6, an oversized array under .max() was
  // still validated item by item, collecting one issue per bad item — 200k
  // over-long skills built a ~43 MB error.message (which every route logs)
  // and ~400 MB of heap. Patched zod rejects on the size check alone, with
  // one issue. This test fails on zod 4.3.6 and passes on the patched range.
  it("rejects an oversized collection on the size check alone", () => {
    const r = ParsedResumeSchema.safeParse({
      ...fullResume,
      skills: Array.from({ length: 200_000 }, () => repeat(101)),
    });
    assertSingleIssue(r, ["skills"], "too_big");
  });
});

describe("ResumeParseAndScoreSchema", () => {
  it("parses a full combined reply, including the 115-char keyword", () => {
    const r = ResumeParseAndScoreSchema.safeParse({
      resume: fullResume,
      ats_analysis: atsAnalysis,
    });
    assert.equal(r.success, true);
    assert.equal(
      r.success && r.data.ats_analysis.keywords_missing[2],
      observedLongKeyword
    );
  });

  // Pitfall 3: a fresher's CV with no summary, experience or skills is real
  // data and must not take the 502 path. Shaped the way the prompt asks for
  // it: every key present, "" and [] for what the resume does not have.
  it("accepts a sparse-but-real fresher CV in the prompt's shape", () => {
    const r = ResumeParseAndScoreSchema.safeParse({
      resume: {
        full_name: "Meera Iyer",
        email: "meera@example.com",
        phone: "",
        location: "",
        summary: "",
        experience: [],
        education: [
          { institution: "Anna University", degree: "B.Sc", year: "2026" },
        ],
        skills: [],
        certifications: ["Google Data Analytics Certificate"],
        languages: [],
      },
      ats_analysis: {
        score: 41,
        strengths: ["Relevant certification for analyst roles"],
        improvements: [
          "Add a skills section listing SQL, spreadsheets and any BI tools",
          "Add a two-line summary naming the roles you are targeting",
        ],
        keywords_missing: ["SQL", "Excel", "Tableau"],
        verdict:
          "Thin for ATS filters today; a skills section and a project or internship would lift it substantially.",
      },
    });
    assert.equal(r.success, true);
  });

  // Older stored parsed_content can predate a field; the schema re-checks it
  // at tailor time and in the chat context, so missing keys must default.
  it("fills defaults when keys are missing entirely", () => {
    const r = ResumeParseAndScoreSchema.safeParse({
      resume: { full_name: "Rohit Nair", education: fullResume.education },
      ats_analysis: atsAnalysis,
    });
    assert.equal(r.success, true);
    assert.deepEqual(r.success && r.data.resume.skills, []);
  });

  it("rejects an extraction with no resume content at all", () => {
    const r = ResumeParseAndScoreSchema.safeParse({
      resume: {},
      ats_analysis: atsAnalysis,
    });
    assert.equal(r.success, false);
  });

  it("accepts a keywords_missing entry exactly at the 200-char cap", () => {
    const r = ResumeParseAndScoreSchema.safeParse({
      resume: fullResume,
      ats_analysis: { ...atsAnalysis, keywords_missing: [repeat(200)] },
    });
    assert.equal(r.success, true);
  });

  it("rejects a keywords_missing entry over the 200-char cap", () => {
    const r = ResumeParseAndScoreSchema.safeParse({
      resume: fullResume,
      ats_analysis: { ...atsAnalysis, keywords_missing: [repeat(201)] },
    });
    assertSingleIssue(r, ["ats_analysis", "keywords_missing", 0], "too_big");
  });

  it("rejects a non-finite score", () => {
    const r = ResumeParseAndScoreSchema.safeParse({
      resume: fullResume,
      ats_analysis: { ...atsAnalysis, score: Number.POSITIVE_INFINITY },
    });
    assertSingleIssue(r, ["ats_analysis", "score"], "invalid_type");
  });
});

// The standalone /api/resume/score site validates against this directly.
describe("ResumeScoreAnalysisSchema", () => {
  it("parses a realistic analysis", () => {
    const r = ResumeScoreAnalysisSchema.safeParse(atsAnalysis);
    assert.equal(r.success, true);
  });

  it("rejects more than 20 strengths", () => {
    const r = ResumeScoreAnalysisSchema.safeParse({
      ...atsAnalysis,
      strengths: Array.from({ length: 21 }, () => "Clear impact"),
    });
    assertSingleIssue(r, ["strengths"], "too_big");
  });
});

describe("TailoredResumeSchema", () => {
  it("parses a full tailored rewrite", () => {
    const r = TailoredResumeSchema.safeParse(fullResume);
    assert.equal(r.success, true);
  });

  // A rewrite of a sparse original (no work history yet): every key present
  // as the prompt requires, contact details copied through, experience [].
  it("accepts a rewrite of a sparse original", () => {
    const r = TailoredResumeSchema.safeParse({
      full_name: "Meera Iyer",
      email: "meera@example.com",
      phone: "",
      location: "Chennai",
      summary:
        "Analytics graduate targeting junior data analyst roles, certified in Google Data Analytics.",
      experience: [],
      education: [
        { institution: "Anna University", degree: "B.Sc", year: "2026" },
      ],
      skills: ["SQL", "Excel"],
      certifications: ["Google Data Analytics Certificate"],
      languages: ["English", "Tamil"],
    });
    assert.equal(r.success, true);
  });

  // Degenerate replies that are JSON objects but not a resume: a wrapper the
  // prompt never asked for and a refusal. Both strip to {} and must 502.
  it("rejects a wrapper object and a refusal object", () => {
    for (const reply of [
      { resume: fullResume },
      { error: "I can't help with that request." },
    ]) {
      const r = TailoredResumeSchema.safeParse(reply);
      assert.equal(r.success, false, JSON.stringify(reply).slice(0, 40));
    }
  });

  it("accepts a summary exactly at the 2000-char cap", () => {
    const r = TailoredResumeSchema.safeParse({
      ...fullResume,
      summary: repeat(2000),
    });
    assert.equal(r.success, true);
  });

  it("rejects a summary over the 2000-char cap", () => {
    const r = TailoredResumeSchema.safeParse({
      ...fullResume,
      summary: repeat(2001),
    });
    assertSingleIssue(r, ["summary"], "too_big");
  });
});
