/**
 * Shared CORS headers for all Supabase Edge Functions.
 * Import this instead of redefining headers in every function:
 *
 *   import { corsHeaders } from "../_shared/cors.ts";
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};
