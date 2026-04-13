# KarSetu.AI — Tax Assistant

AI-powered Indian income tax computation engine built with React + Supabase Edge Functions.

---

## Required environment variables (frontend)

Create a `.env.local` file in the project root:

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-supabase-anon-key>   # must be a JWT (starts with eyJ…)
```

> **Important:** `VITE_SUPABASE_PUBLISHABLE_KEY` must be your project's **anon key** — a JWT that
> looks like `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`.  Setting it to a plain API key, URL, or
> any non-JWT value causes the edge functions to return
> `{"code":401,"message":"Invalid Token or Protected Header formatting"}`.

---

## Required Supabase secrets (edge functions)

Set once per Supabase project (Dashboard → Edge Functions → Secrets, or via CLI):

```bash
supabase secrets set GOOGLE_AI_API_KEY=<your-google-ai-api-key>
```

Without this secret the functions fall back to basic text extraction (no AI OCR).

---

## Edge functions

| Function | Path | JWT verification |
|---|---|---|
| `parse-documents` | `/functions/v1/parse-documents` | disabled (public) |
| `compute-tax` | `/functions/v1/compute-tax` | disabled (public) |

JWT verification is disabled via `supabase/config.toml` so both functions are callable with the
anon key **or** without any Authorization header.  If you want to restrict access, re-enable
`verify_jwt = true` for each function in `config.toml` and ensure the frontend sends a valid
Supabase JWT.

---

## Deploy edge functions

```bash
# link to your project
supabase link --project-ref <your-project-ref>

# deploy both functions
supabase functions deploy parse-documents
supabase functions deploy compute-tax

# set secrets
supabase secrets set GOOGLE_AI_API_KEY=<your-key>
```

---

## Local development

```bash
npm install
npm run dev

# serve edge functions locally (in a separate terminal)
supabase functions serve parse-documents --env-file supabase/.env
supabase functions serve compute-tax     --env-file supabase/.env
```
