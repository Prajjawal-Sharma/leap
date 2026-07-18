# CLAUDE.md — Leap Project Context

## What We Are Building
Leap is an AI-powered semantic job matching platform for Indian software engineers
switching from service companies (TCS, Infosys, Wipro) to product companies, GCCs,
and eventually FAANG. Think YouTube recommendations, but for jobs — semantic match
based on actual fit, not keyword stuffing.

Owner: Prajjawal Sharma (meprajjwalsharma@gmail.com), System Engineer at TCS Gurugram.
Repo: github.com/Prajjawal-Sharma/leap
Vercel: https://leap-five-delta.vercel.app

## Tech Stack (LOCKED — do not suggest alternatives)
- Framework: Next.js 15 App Router + TypeScript strict mode
- UI: Tailwind CSS + shadcn/ui primitives + Framer Motion
- Database: Supabase (Postgres + pgvector + Auth + Storage)
- AI: Gemini API — chat (gemini-2.5-flash) streams via Vercel AI SDK (@ai-sdk/google) on Tier 1 paid (GEMINI_KEY_1, 3000 RPM); free 8-key rotation (GEMINI_KEY_1..8) serves resume parse + ATS scoring
- Embeddings: gemini-embedding-001, 768 dimensions, RETRIEVAL_DOCUMENT for jobs, RETRIEVAL_QUERY for resume
- Job data: Greenhouse direct API (25 companies, ~3,800 jobs), more sources in Phase 2
- Email: Resend free tier
- Hosting: Vercel free tier
- Monitoring: Vercel Analytics + Sentry free tier

## Known Issues
- Google OAuth config fix pending

## Database Schema (Supabase, public schema)
- profiles: id (= auth.users.id), email, full_name, current_job_title, target_roles[], target_locations[], expected_salary_min/max/currency, onboarded_at
- resumes: id, user_id, file_name, file_path, parsed_content (jsonb), ats_score, is_primary, created_at
- jobs: id, source, source_id, title, company, location, is_remote, description, requirements, employment_type, apply_url, posted_at, is_active, ingested_at
- job_embeddings: id, job_id (fk→jobs), embedding vector(768), created_at
- applications: id, user_id, job_id (fk→jobs), status (saved|applied|viewed|interviewing|offered|rejected|withdrawn), notes, tailored_resume_id, applied_at, updated_at
- RLS enabled on all tables

## Current Sprint: Week 3 — Application Intelligence
Feature status (in order):
1. AI Career Chat (/chat) — gemini-2.5-flash, grounded in profile/resume/applications, streaming via the Vercel AI SDK on the Tier 1 paid key [SHIPPED — merged to dev]
2. One-Click Tailored Resume — Gemini 2.5 Pro rewrites resume per JD, export PDF [SHIPPED — merged to dev via PR #17; PDF export still pending]

## Coding Standards
- Always use TypeScript strict mode — no `any` unless absolutely necessary
- Server components for data fetching, Client components for interactivity
- Supabase server client in server components/routes, browser client in "use client" components
- All DB operations for user data must check RLS (user_id = auth.user.id)
- Error boundaries on every page
- Loading skeletons for all async data
- Mobile responsive: 375px minimum width, 44px touch targets
- No hardcoded user IDs anywhere

## Agent Instructions
- Read this file at the start of every session
- Read ROADMAP.md for feature context
- Prefer editing existing files over creating new abstractions
- After every task: run tsc --noEmit and eslint, report results
- Output a standard summary: files created, files modified, key decisions, things deferred
- Never suggest Spring Boot, Java, Redis, or paid services not already in use
- Token budget: batch related changes into single tasks, avoid separate tasks for lint/format

## Branch Strategy
main ← protected, auto-deploys to Vercel
dev ← integration branch, merge PRs here
feat/* ← one branch per feature, PR to dev
