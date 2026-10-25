// Regression fixtures for the Gemini JSON output schemas, added with the zod
// 4.3.6 -> 4.6.x security bump (GHSA-mrhx-c7xc-m3w5) to prove the upgrade
// changes nothing about what parses and what 502s. Runner: Node's built-in
// node:test via tsx (no new dependencies) — `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ParsedResumeSchema,
  ResumeParseAndScoreSchema,
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

  it("rejects a skill over the 100-char cap", () => {
    const r = ParsedResumeSchema.safeParse({
      ...fullResume,
      skills: ["Go", repeat(101)],
    });
    assert.equal(r.success, false);
  });

  it("rejects more than 30 experience entries", () => {
    const r = ParsedResumeSchema.safeParse({
      ...fullResume,
      experience: Array.from({ length: 31 }, () => fullResume.experience[0]),
    });
    assert.equal(r.success, false);
  });

  // The advisory: validating an oversized array under a .max() could exhaust
  // memory. A hostile reply with a huge skills array must fail, and fail fast.
  it("rejects a hugely oversized collection quickly", () => {
    const started = Date.now();
    const r = ParsedResumeSchema.safeParse({
      ...fullResume,
      skills: Array.from({ length: 200_000 }, () => "Go"),
    });
    assert.equal(r.success, false);
    assert.ok(Date.now() - started < 2_000, "validation took over 2s");
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
  // data and must not take the 502 path.
  it("accepts a sparse-but-real fresher CV", () => {
    const r = ResumeParseAndScoreSchema.safeParse({
      resume: {
        full_name: "Meera Iyer",
        email: "meera@example.com",
        education: [
          { institution: "Anna University", degree: "B.Sc", year: "2026" },
        ],
        certifications: ["Google Data Analytics Certificate"],
      },
      ats_analysis: { score: 41 },
    });
    assert.equal(r.success, true);
    if (!r.success) return;
    assert.deepEqual(r.data.ats_analysis.strengths, []);
    assert.equal(r.data.ats_analysis.verdict, "");
  });

  it("rejects an extraction with no resume content at all", () => {
    const r = ResumeParseAndScoreSchema.safeParse({
      resume: {},
      ats_analysis: atsAnalysis,
    });
    assert.equal(r.success, false);
  });

  it("rejects a keywords_missing entry over the 200-char cap", () => {
    const r = ResumeParseAndScoreSchema.safeParse({
      resume: fullResume,
      ats_analysis: { ...atsAnalysis, keywords_missing: [repeat(201)] },
    });
    assert.equal(r.success, false);
  });

  it("rejects a non-finite score", () => {
    const r = ResumeParseAndScoreSchema.safeParse({
      resume: fullResume,
      ats_analysis: { ...atsAnalysis, score: Number.POSITIVE_INFINITY },
    });
    assert.equal(r.success, false);
  });
});

describe("TailoredResumeSchema", () => {
  it("parses a full tailored rewrite", () => {
    const r = TailoredResumeSchema.safeParse(fullResume);
    assert.equal(r.success, true);
  });

  it("accepts a sparse rewrite that carries only skills", () => {
    const r = TailoredResumeSchema.safeParse({
      full_name: "Asha Verma",
      skills: ["Go", "Kafka"],
    });
    assert.equal(r.success, true);
  });

  it("rejects a degenerate reply with no summary, experience or skills", () => {
    const r = TailoredResumeSchema.safeParse({
      full_name: "Asha Verma",
      education: fullResume.education,
    });
    assert.equal(r.success, false);
  });

  it("rejects a summary over the 2000-char cap", () => {
    const r = TailoredResumeSchema.safeParse({
      ...fullResume,
      summary: repeat(2001),
    });
    assert.equal(r.success, false);
  });
});
