import { callGeminiTier1, GeminiError } from "./gemini-client";

// Gemini gemini-embedding-001 — replaces text-embedding-004, which was shut
// down 2026-01-14. Native output is 3072 dims; we use Matryoshka
// Representation Learning via `outputDimensionality: 768` so the response
// fits the existing public.job_embeddings.embedding column (vector(768))
// without a schema change.
//
// Embeddings run on GEMINI_KEY_1's Tier 1 (paid) project — ~3000 RPM. The
// free-tier multi-key rotation that callGemini uses is unnecessary here and
// the per-key cooldown machinery would actively cap throughput.
//
// Use RETRIEVAL_DOCUMENT for stored content (jobs) and RETRIEVAL_QUERY for
// the user-side text we compare against (resume / search query).
const EMBED_MODEL = "models/gemini-embedding-001";
const EMBED_DIMS = 768;
const SINGLE_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/${EMBED_MODEL}:embedContent`;
const BATCH_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/${EMBED_MODEL}:batchEmbedContents`;
// Tier 1's batchEmbedContents accepts up to 100 requests per call. At free
// tier we used to keep this at 5 to survive RPM limits; on Tier 1 we lean on
// the per-call ceiling for throughput.
const MAX_BATCH = 100;

export type EmbeddingTaskType =
  | "RETRIEVAL_DOCUMENT"
  | "RETRIEVAL_QUERY"
  | "SEMANTIC_SIMILARITY"
  | "CLASSIFICATION"
  | "CLUSTERING";

type EmbedSingleResponse = {
  embedding?: { values?: number[] };
};

type EmbedBatchResponse = {
  embeddings?: Array<{ values?: number[] }>;
};

const logAttempt = (label: string) => (attempt: number) => {
  if (attempt > 0) console.log(`[embeddings] ${label} retry ${attempt}`);
};

export async function embedText(
  text: string,
  taskType: EmbeddingTaskType = "RETRIEVAL_DOCUMENT"
): Promise<number[]> {
  if (!text || !text.trim()) {
    throw new GeminiError("embedText: empty input", 400, false);
  }

  return callGeminiTier1<number[]>(
    (key) =>
      fetch(`${SINGLE_ENDPOINT}?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: EMBED_MODEL,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: EMBED_DIMS,
        }),
      }),
    async (res) => {
      const json = (await res.json()) as EmbedSingleResponse;
      const values = json.embedding?.values;
      if (!Array.isArray(values) || values.length !== EMBED_DIMS) {
        throw new GeminiError(
          `Embedding response missing ${EMBED_DIMS}-dim values (got ${values?.length ?? "none"})`,
          502,
          false
        );
      }
      return values;
    },
    { onAttempt: logAttempt("embedText") }
  );
}

export async function embedBatch(
  texts: string[],
  taskType: EmbeddingTaskType = "RETRIEVAL_DOCUMENT"
): Promise<number[][]> {
  if (texts.length === 0) return [];

  // gemini-embedding-001's batchEmbedContents accepts up to 100 requests per
  // call. Caller may pass more — split into chunks and concatenate.
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const chunk = texts.slice(i, i + MAX_BATCH);
    if (chunk.some((t) => !t || !t.trim())) {
      throw new GeminiError(
        "embedBatch: chunk contains empty input — filter callers",
        400,
        false
      );
    }
    const chunkResult = await callGeminiTier1<number[][]>(
      (key) =>
        fetch(`${BATCH_ENDPOINT}?key=${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: chunk.map((text) => ({
              model: EMBED_MODEL,
              content: { parts: [{ text }] },
              taskType,
              outputDimensionality: EMBED_DIMS,
            })),
          }),
        }),
      async (res) => {
        const json = (await res.json()) as EmbedBatchResponse;
        const list = json.embeddings ?? [];
        if (list.length !== chunk.length) {
          throw new GeminiError(
            `Batch embeddings mismatch: requested ${chunk.length}, got ${list.length}`,
            502,
            false
          );
        }
        const vectors: number[][] = [];
        for (let j = 0; j < list.length; j++) {
          const values = list[j]?.values;
          if (!Array.isArray(values) || values.length !== EMBED_DIMS) {
            throw new GeminiError(
              `Batch item ${j}: expected ${EMBED_DIMS}-dim values (got ${values?.length ?? "none"})`,
              502,
              false
            );
          }
          vectors.push(values);
        }
        return vectors;
      },
      { onAttempt: logAttempt(`embedBatch(${chunk.length})`) }
    );
    out.push(...chunkResult);
  }

  return out;
}
