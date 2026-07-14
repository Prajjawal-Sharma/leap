// Curated list of companies with public Greenhouse boards we ingest from.
// Each slug must match the company's Greenhouse board path:
// https://boards-api.greenhouse.io/v1/boards/{slug}/jobs
//
// Ordering doesn't affect correctness (the ingest runner fetches these with
// limited concurrency) but keep grouped by category for human review.
//
// 2026-07-14 audit: every slug probed against the live boards API. Seven of
// the original 25 had never returned a job. Removed the five whose companies
// left Greenhouse — plaid, shopify, notion (now on Ashby), hashicorp (IBM
// careers portal post-acquisition), retool (no public board found) — and
// renamed doordash -> doordashusa (462 jobs) and datadoghq -> datadog
// (422 jobs), both verified live.
export const GREENHOUSE_COMPANIES: string[] = [
  // Payments / fintech
  "stripe",
  "robinhood",
  "monzo",
  "brex",
  "gusto",
  // Consumer / marketplace
  "airbnb",
  "doordashusa",
  "instacart",
  "pinterest",
  // Dev tools / infra
  "cloudflare",
  "gitlab",
  "vercel",
  "mongodb",
  "datadog",
  "twilio",
  // Productivity / SaaS
  "figma",
  "asana",
  "dropbox",
  "squarespace",
  "mixpanel",
];
