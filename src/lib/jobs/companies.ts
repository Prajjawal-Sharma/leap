// Curated list of companies with public Greenhouse boards we ingest from.
// Each slug must match the company's Greenhouse board path:
// https://boards-api.greenhouse.io/v1/boards/{slug}/jobs
//
// Ordering doesn't affect correctness (the cron handler iterates this list
// sequentially) but keep grouped by category for human review.
export const GREENHOUSE_COMPANIES: string[] = [
  // Payments / fintech
  "stripe",
  "robinhood",
  "plaid",
  "monzo",
  "brex",
  "gusto",
  // Consumer / marketplace
  "airbnb",
  "shopify",
  "doordash",
  "instacart",
  "pinterest",
  // Dev tools / infra
  "cloudflare",
  "gitlab",
  "vercel",
  "hashicorp",
  "mongodb",
  "datadoghq",
  "twilio",
  // Productivity / SaaS
  "figma",
  "notion",
  "asana",
  "dropbox",
  "squarespace",
  "mixpanel",
  "retool",
];
