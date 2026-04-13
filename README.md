# KarSetu Tax Assistant

AI-powered Indian income tax computation engine built with React, Vite, and Supabase Edge Functions. Uses Google Gemini to parse tax documents and compute AY 2026-27 tax liability under both Old and New regimes.

---

## Quick start

### 1. Prerequisites
- [Node.js 18+](https://nodejs.org/) and `npm`
- A [Supabase](https://supabase.com) project
- A [Gemini API key](https://aistudio.google.com/app/apikey) (free tier works)

### 2. Clone and install

```bash
git clone https://github.com/chirayukhandelwal03/karsetu-tax-assistant.git
cd karsetu-tax-assistant
npm install
```

### 3. Configure frontend environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` and set:

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase dashboard → Settings → API → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase dashboard → Settings → API → anon public key |

### 4. Configure Supabase Edge Function secrets

The edge functions need a Gemini API key set as a **Supabase secret** (not a `.env` file).

**Option A — Supabase dashboard (easiest)**

1. Open your project in [supabase.com/dashboard](https://supabase.com/dashboard)
2. Go to **Edge Functions** → **Secrets**
3. Add a new secret:
   - **Name:** `GOOGLE_AI_API_KEY`
   - **Value:** your Gemini API key from [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

**Option B — Supabase CLI**

```bash
supabase secrets set GOOGLE_AI_API_KEY=<your-key> --project-ref <your-project-ref>
```

### 5. Deploy edge functions

```bash
# Install Supabase CLI if needed
npm install -g supabase

# Link to your project
supabase link --project-ref <your-project-ref>

# Deploy both functions
supabase functions deploy compute-tax
supabase functions deploy parse-documents
```

> **Important:** Every time you change a secret you must redeploy the affected functions for the new value to take effect.

### 6. Run locally

```bash
npm run dev
```

---

## Required secrets / environment variables

### Frontend (`.env.local`)

| Name | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon public key |

### Edge Functions (Supabase Secrets)

| Name | Description | Required |
|---|---|---|
| `GOOGLE_AI_API_KEY` | Google Gemini API key | **Yes** — both `compute-tax` and `parse-documents` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Legacy alias (deprecated) | No — use `GOOGLE_AI_API_KEY` |

If `GOOGLE_AI_API_KEY` is missing, `compute-tax` returns a structured error with code `API_KEY_MISSING` and an actionable message shown to the user.

---

## Development

```bash
npm run dev       # start Vite dev server
npm run build     # production build
npm run lint      # ESLint
npm test          # Vitest unit tests
```

---

## Troubleshooting

### "Google AI API key is invalid or not enabled for Gemini API"
- Check that you set `GOOGLE_AI_API_KEY` under **Edge Functions → Secrets** in your Supabase dashboard.
- Make sure you redeployed the functions **after** setting the secret.
- Verify the key is valid at [aistudio.google.com](https://aistudio.google.com/app/apikey).

### Compute returns HTTP 500
- Open Supabase dashboard → Edge Functions → `compute-tax` → **Logs** for detailed diagnostics.
- Ensure the function was deployed to the correct Supabase project.

### Supabase project connection issues
- Confirm `VITE_SUPABASE_URL` points to your accessible project.
- Reconnect via Lovable **Connectors → Supabase** and select the correct project, or manually set the env vars.
