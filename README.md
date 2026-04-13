# KarSetu.AI — Tax Assistant

AI-powered Indian income tax computation engine.  
Built with **React + Vite** (frontend) and **Supabase Edge Functions** (backend/AI).

---

## Table of Contents

1. [Project overview](#project-overview)
2. [Frontend setup](#frontend-setup)
3. [Supabase Edge Functions — complete guide](#supabase-edge-functions--complete-guide)
   - [Folder structure](#folder-structure)
   - [Shared code (`_shared`)](#shared-code-_shared)
   - [Local development](#local-development)
   - [Deploying functions](#deploying-functions)
   - [Secrets management](#secrets-management)
   - [How the frontend calls each function](#how-the-frontend-calls-each-function)
   - [Automated deployment with GitHub Actions](#automated-deployment-with-github-actions)
   - [Common pitfalls](#common-pitfalls)
   - [Quick verification checklist](#quick-verification-checklist)

---

## Project overview

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind |
| BaaS / DB | Supabase (Postgres + Auth) |
| AI backend | Supabase Edge Functions (Deno) → Google Gemini API |
| Deployment | Supabase CLI / GitHub Actions |

---

## Frontend setup

```bash
# 1. Install dependencies
npm install

# 2. Copy the env template and fill in your Supabase project values
cp .env.example .env          # or create manually

# 3. Start dev server
npm run dev
```

**Required frontend env vars** (`.env` at project root):

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-public-key>
```

---

## Supabase Edge Functions — complete guide

### Folder structure

Each edge function lives in its **own folder** under `supabase/functions/`.  
Every folder must contain an `index.ts` entry point.

```
supabase/
├── config.toml                  ← project config (project_id)
├── .env.example                 ← template; copy to .env for local dev
├── .env                         ← git-ignored; real secrets for local dev
└── functions/
    ├── _shared/                 ← shared helpers imported by multiple functions
    │   └── cors.ts              ← shared CORS headers
    ├── compute-tax/
    │   └── index.ts             ← Tax computation + Gemini streaming
    └── parse-documents/
        └── index.ts             ← Document OCR + classification via Gemini
```

> **Rule:** one folder = one function.  
> You do **not** need any extra config files inside each function folder.

---

### Shared code (`_shared`)

The `_shared` directory holds modules that multiple functions import.  
It is **not deployed as a function** itself — it is bundled with any function that imports it.

Example — import the shared CORS headers inside a function:

```typescript
// supabase/functions/my-new-function/index.ts
import { corsHeaders } from "../_shared/cors.ts";
```

Add any shared types, utilities, or API clients to `_shared/` to avoid duplication.

---

### Local development

#### Prerequisites

```bash
# Install Supabase CLI (once)
npm install -g supabase        # or: brew install supabase/tap/supabase
```

#### One-time project link

```bash
supabase login                              # opens browser, paste your token
supabase link --project-ref <project-ref>  # find ref in Supabase → Settings → General
```

#### Create local secrets file

```bash
cp supabase/.env.example supabase/.env
# Edit supabase/.env and add your real GOOGLE_AI_API_KEY
```

#### Serve a single function locally

```bash
supabase functions serve compute-tax    --env-file supabase/.env
supabase functions serve parse-documents --env-file supabase/.env
```

The function will be available at `http://localhost:54321/functions/v1/<function-name>`.

> **Tip:** run both functions in two separate terminals if you need them simultaneously.

---

### Deploying functions

#### Deploy a single function

```bash
supabase functions deploy compute-tax
supabase functions deploy parse-documents
```

#### Deploy all functions at once

```bash
supabase functions deploy --no-verify-jwt
```

> `--no-verify-jwt` allows the frontend (with the anon key) to call functions without a
> logged-in user. Remove this flag if your function should require authentication.

After deployment each function is live at:

```
https://<project-ref>.supabase.co/functions/v1/<function-name>
```

---

### Secrets management

Secrets are **server-side only** — never put them in the frontend or in `git`.

#### Set a secret in production (one-time per project)

```bash
supabase secrets set GOOGLE_AI_API_KEY=your_real_key_here
```

#### List / verify secrets

```bash
supabase secrets list
```

#### Read a secret inside a function (Deno)

```typescript
const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
if (!GOOGLE_AI_API_KEY) {
  return new Response(
    JSON.stringify({ error: "GOOGLE_AI_API_KEY secret not set" }),
    { status: 500, headers: corsHeaders }
  );
}
```

#### Local development secrets

Put secrets in `supabase/.env` (git-ignored) and pass it with `--env-file`:

```
# supabase/.env
GOOGLE_AI_API_KEY=your_dev_key
```

---

### How the frontend calls each function

The project uses two calling styles — both are correct:

#### Style 1 — Supabase client helper (recommended for simple JSON calls)

```typescript
import { supabase } from "@/integrations/supabase/client";

const { data, error } = await supabase.functions.invoke("parse-documents", {
  body: { files },
});
```

#### Style 2 — Native `fetch` (required for streaming responses)

```typescript
const response = await fetch(
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/compute-tax`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ assesseeSetup, parsedDocuments, userInstructions }),
  }
);
// read response.body as a ReadableStream for SSE / streaming
```

Both styles hit the same URL pattern:
`https://<project-ref>.supabase.co/functions/v1/<function-name>`

---

### Automated deployment with GitHub Actions

The workflow at `.github/workflows/deploy-edge-functions.yml` automatically deploys
all edge functions on every push to `main` that touches `supabase/functions/**`.

#### One-time GitHub setup

Go to **Settings → Secrets and variables → Actions** in your GitHub repository and add:

| Secret name | Where to find it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase Dashboard → Account → Access Tokens |
| `SUPABASE_PROJECT_REF` | Supabase Dashboard → Settings → General → Reference ID |

After this, every merged PR that changes a function triggers an automatic deploy — no manual steps needed.

---

### Common pitfalls

| Symptom | Likely cause | Fix |
|---|---|---|
| `500` from function | `GOOGLE_AI_API_KEY` secret not set | `supabase secrets set GOOGLE_AI_API_KEY=...` |
| CORS error in browser | Missing `OPTIONS` handler | Make sure function returns `corsHeaders` for `OPTIONS` requests |
| Old code still running after deploy | Cached at CDN edge | Wait 1–2 min or append `?v=2` in local test |
| `import` path error in shared module | Wrong relative path | Use `"../_shared/cors.ts"` (two dots, no `@`) |
| Serve command fails locally | Not linked to project | Run `supabase link --project-ref <ref>` first |
| GitHub Action fails: "project not found" | `SUPABASE_PROJECT_REF` secret wrong | Copy ref from Supabase → Settings → General |

---

### Quick verification checklist

After deploying, run through this in 2 minutes:

- [ ] `supabase secrets list` shows `GOOGLE_AI_API_KEY`
- [ ] Upload a sample document → Network tab shows `parse-documents` returns **200**
- [ ] Start tax computation → Network tab shows `compute-tax` returns **200** (streaming)
- [ ] Result page renders computed tax output without errors
- [ ] No `500` or `CORS` errors in the browser console

