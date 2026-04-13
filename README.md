# KarSetu Tax Assistant

An AI-powered Indian income tax computation engine built with React (Vite) and Supabase Edge Functions.

## Required Secrets / Environment Variables

### Supabase Edge Function Secrets

Set these as [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets) before deploying or redeploying the edge functions:

| Secret name       | Description                                                    |
|-------------------|----------------------------------------------------------------|
| `GOOGLE_AI_API_KEY` | A valid Google Gemini API key. Obtain from [Google AI Studio](https://aistudio.google.com/app/apikey). |

To set the secret via the Supabase CLI:

```bash
supabase secrets set GOOGLE_AI_API_KEY=<your-key>
```

Then redeploy both edge functions:

```bash
supabase functions deploy compute-tax
supabase functions deploy parse-documents
```

### Frontend Environment Variables

Set these in your deployment environment (e.g. Lovable project settings or a local `.env` file):

| Variable                      | Description                                      |
|-------------------------------|--------------------------------------------------|
| `VITE_SUPABASE_URL`           | Your Supabase project URL (e.g. `https://<ref>.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Your Supabase project **anon/public** API key  |

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Tests

```bash
npm run test
```
