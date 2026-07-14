# Vertex AI vs. AI Studio: Cost & Migration Brief

Based on the 2026 documentation, here is the research regarding your migration from AI Studio to Vertex AI.

### 1. GCP Credits Eligibility
*   **(a) Vertex AI:** **Yes**, your ₹27,000 ($300 equivalent) Google Cloud Free Trial/Promo credits can be applied to Vertex AI Generative AI models.
*   **(b) AI Studio (Gemini API):** **No**, the free trial credits *cannot* be used for AI Studio costs.
*   **Source:** [Google Cloud Free Tier Docs (2026)](https://cloud.google.com/free/docs/free-cloud-features#during-free-trial) explicitly state: *"The $300 credit can't pay for Gemini API in AI Studio costs. Consider using the Gemini API Free tier, or sign up for a Prepay billing plan."*

### 2. Migration to Vertex AI: Exact Setup
To transition embeddings and generation to Vertex AI:
*   **Project & Billing:** Create a Google Cloud Project and ensure it is linked to the Cloud Billing account holding your ₹27,000 credits.
*   **Enable APIs:** Enable the `Vertex AI API` in the Google Cloud Console.
*   **Region:** Select an available region for Gemini models (e.g., `us-central1`, `us-east5`, `europe-west4`, etc.).
*   **Service Account & IAM:** Create a Service Account. Assign it the **`Vertex AI User`** (`roles/aiplatform.user`) role, which grants permission to use Vertex AI models. Generate and download a JSON key.
*   **App Integration:** Instead of an AI Studio API key, authenticate via Google Cloud Application Default Credentials (ADC) or direct Service Account credentials.

### 3. Model IDs & Pricing (Vertex vs. AI Studio)
The pricing between Vertex AI and AI Studio for GenAI is generally aligned as of 2026, but the model IDs and embedding structures differ slightly.
*   **Embeddings:**
    *   **Vertex Model ID:** `text-embedding-005` (or `text-multilingual-embedding-002`). Note: Vertex recently shifted from `gemini-embedding` to these specialized endpoints.
    *   **Vertex Price:** ~$0.03 per 1M input tokens ($0.000025 per 1,000 characters).
    *   **AI Studio Price:** `text-embedding-004` is $0.02 per 1M tokens.
*   **Generation (Gemini 2.5 Flash):**
    *   **Vertex Model ID:** `gemini-2.5-flash`
    *   **Vertex Price:** $0.30 per 1M input tokens (≤200K context), $2.50 per 1M output tokens.
    *   **AI Studio Price:** Identical ($0.30 input / $2.50 output per million).

### 4. Vercel Node Runtime & Auth Gotchas
Vercel’s Node.js runtime works well with Vertex AI Service Account authentication, but there are important caveats:
*   **Vercel Node Runtime:** You can pass the credentials directly when initializing the Vertex AI SDK (e.g., using `@ai-sdk/google-vertex` or the official `@google/genai` SDK) via the `googleAuthOptions` property, using `client_email` and `private_key` environment variables.
*   **Gotcha 1 - Private Key Formatting:** Vercel environment variables often break the newline `\n` characters in Google Cloud private keys. You must wrap the private key value in quotes in the Vercel dashboard or replace `\\n` with `\n` in your code before passing it to the SDK: `process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')`.
*   **Gotcha 2 - Edge Runtime Compatibility:** If any of your routes use Vercel's *Edge Runtime*, the standard Google Auth Library (which relies on Node's `fs` and `crypto`) will crash. For Edge routes, you **must** use the Edge-specific build, for example: `import { vertex } from '@ai-sdk/google-vertex/edge';`, which takes the environment variables natively.

### 5. Bottom Line & Recommendation
**Recommendation: Migrate to Vertex AI.**

*   **Will it absorb the cost?** Yes. Vertex AI sits entirely within the Google Cloud ecosystem, meaning your ₹27,000 promo credits will fully absorb the ~₹327 embedding backfill cost and subsequent generation requests until the credits expire (typically 90 days).
*   **Caveats & Quotas:**
    *   *Quotas:* New Google Cloud projects have strict default quota limits for Vertex AI (often lower initial Requests Per Minute (RPM) than AI Studio). You may need to request a quota increase in the GCP console for `us-central1` if you are batching your 3,800 job descriptions rapidly.
    *   *Migration overhead:* You'll need to adapt your code slightly to use Google Cloud Auth instead of a simple API key, but given the Vercel AI SDK handles both nicely, it is a straightforward swap.
