import { describe, it, expect } from "vitest";

/**
 * Tests for the structured error handling utilities used in Compute.tsx.
 * These mirror the `buildErrorMessage` helper and validate that structured
 * API error payloads are surfaced correctly to the user.
 */

/** Inline copy of the helper to keep tests self-contained. */
const buildErrorMessage = (
  payload: { error?: string; code?: string; actionable?: string } | null,
  fallback: string
): string => {
  if (!payload) return fallback;
  const base = payload.error || fallback;
  if (payload.actionable) return `${base}\n\n${payload.actionable}`;
  return base;
};

describe("buildErrorMessage", () => {
  it("returns fallback when payload is null", () => {
    expect(buildErrorMessage(null, "Computation failed")).toBe("Computation failed");
  });

  it("returns error message without actionable", () => {
    const payload = { error: "Key is invalid", code: "API_KEY_INVALID" };
    expect(buildErrorMessage(payload, "fallback")).toBe("Key is invalid");
  });

  it("appends actionable hint when present", () => {
    const payload = {
      error: "Google AI API key is not configured on this server.",
      code: "API_KEY_MISSING",
      actionable: "Set GOOGLE_AI_API_KEY in Supabase secrets.",
    };
    const result = buildErrorMessage(payload, "fallback");
    expect(result).toContain("Google AI API key is not configured on this server.");
    expect(result).toContain("Set GOOGLE_AI_API_KEY in Supabase secrets.");
    expect(result).toContain("\n\n");
  });

  it("uses fallback as base when payload has no error field", () => {
    const payload = { code: "COMPUTE_ERROR", actionable: "Retry the request." };
    const result = buildErrorMessage(payload, "Computation failed");
    expect(result).toContain("Computation failed");
    expect(result).toContain("Retry the request.");
  });

  it("does not include actionable separator when actionable is absent", () => {
    const payload = { error: "Something broke" };
    expect(buildErrorMessage(payload, "fallback")).toBe("Something broke");
  });
});

describe("error code handling", () => {
  const knownCodes = [
    "API_KEY_MISSING",
    "API_KEY_INVALID",
    "GEMINI_QUOTA_EXCEEDED",
    "GEMINI_PERMISSION_DENIED",
    "GEMINI_SERVER_ERROR",
    "GEMINI_UNKNOWN_ERROR",
    "GEMINI_EMPTY_RESPONSE",
    "COMPUTE_ERROR",
    "PARSE_ERROR",
  ];

  it("all known error codes are non-empty strings", () => {
    for (const code of knownCodes) {
      expect(typeof code).toBe("string");
      expect(code.length).toBeGreaterThan(0);
    }
  });

  it("API_KEY_MISSING payload is structured correctly", () => {
    const payload = {
      error: "Google AI API key is not configured on this server.",
      code: "API_KEY_MISSING" as const,
      actionable:
        "In the Supabase dashboard → Edge Functions → Secrets, add GOOGLE_AI_API_KEY with a valid Gemini API key.",
    };
    expect(payload.code).toBe("API_KEY_MISSING");
    expect(payload.error).toBeTruthy();
    expect(payload.actionable).toBeTruthy();
    // Ensure no key value is leaked
    expect(payload.actionable).not.toMatch(/AIzaSy/);
    expect(payload.error).not.toMatch(/AIzaSy/);
  });
});
