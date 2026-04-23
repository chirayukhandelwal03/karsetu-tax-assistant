import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// compute-tax — Stage 3 of the 3-stage pipeline.
// Input is CLEAN, pre-normalized JSON from Stage 2 (extract-document).
// This function applies Indian tax law to aggregate figures. It does NOT
// parse raw OCR, does NOT classify documents, does NOT enumerate line items
// from bank-statement narrations — all of that is done upstream.
//
// This is why the prompt is short: its job is just tax law + regime choice.

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://karsetu.info,https://www.karsetu.info,http://localhost:5173,http://localhost:8080")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const buildCorsHeaders = (origin: string | null): Record<string, string> => {
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, apikey",
  };
};

// Output sentinels — everything between these markers is the authoritative JSON
// payload. Keeps Python trace / code-execution output from contaminating the
// parse step (which previously greedy-matched { ... } and swallowed dict literals).
const RESULT_OPEN = "<<<KARSETU_RESULT_START>>>";
const RESULT_CLOSE = "<<<KARSETU_RESULT_END>>>";

const SYSTEM_PROMPT = `You are an Indian Tax Computation Engine for individual / HUF assessees under the Income Tax Act 1961 as amended by Finance Act 2025 (AY 2026-27 by default).

Your ONLY job: given pre-extracted, already-normalized JSON data about the assessee's financial year, compute tax under Old and New regimes and recommend the better one.

Non-negotiables:
1. NO MENTAL ARITHMETIC — for every total, slab calculation, surcharge, cess, rebate, set-off, you MUST write and run Python using the Code Execution tool and use its printed output.
2. Never invent figures. If a required field is missing or zero in the input JSON, record it under assumptions as a DATA_GAP. Do not fabricate numbers.
3. The extraction step already aggregated line items (e.g. bank credits into buckets, broker P&L into STCG/LTCG/F&O). Do NOT re-parse raw narrations — trust the extracted figures and use them directly.
4. If code execution is unavailable for any reason, compute with extreme care in-line, show every sub-step in a "calcTrace" string on each taxComputation branch, and add a RED flag "Code execution unavailable — verify arithmetic manually".

DOMAIN CONSTANTS (AY 2026-27, FY 2025-26):
- OLD REGIME slabs (below 60): 0% to 2.5L; 5% 2.5–5L; 20% 5–10L; 30% above. 87A rebate ₹12,500 if total income ≤ 5L.
- OLD REGIME (60–79): 0% to 3L; 5% 3–5L; 20% 5–10L; 30% above. 87A rebate ₹12,500 if total income ≤ 5L.
- OLD REGIME (80+): 0% to 5L; 20% 5–10L; 30% above. 87A NOT APPLICABLE.
- NEW REGIME (§ 115BAC, all ages): 0% to 4L; 5% 4–8L; 10% 8–12L; 15% 12–16L; 20% 16–20L; 25% 20–24L; 30% above. Standard deduction ₹75,000 for salaried / family-pension recipients only.
- NEW REGIME 87A rebate (CRITICAL): If total income ≤ ₹12,00,000 → rebate = min(tax_on_slab_income, ₹60,000). If total income is JUST ABOVE ₹12,00,000, apply MARGINAL RELIEF: rebate = max(0, tax_on_slab_income − (total_income − 12,00,000)). This ensures post-tax income never falls below ₹12,00,000 due to the cliff. Apply marginal relief up to roughly ₹12,75,000 (the break-even). 87A does NOT reduce tax on special-rate incomes (§ 111A, § 112, § 112A, § 115BBH, § 115BBJ, § 115BB).
- Surcharge (on tax BEFORE cess, AFTER 87A rebate):
  * OLD regime: 10% (50L<income≤1Cr); 15% (1Cr<income≤2Cr); 25% (2Cr<income≤5Cr); 37% (income>5Cr).
  * NEW regime: 10% (50L<income≤1Cr); 15% (1Cr<income≤2Cr); 25% (2Cr<income≤5Cr); 25% (income>5Cr) — 37% is NOT available in § 115BAC.
  * CAP at 15% on tax attributable to § 111A STCG, § 112 LTCG, § 112A LTCG, and dividend income (§ 57) regardless of total income level.
  * MARGINAL RELIEF on surcharge at every threshold — total (tax+surcharge) at income just above a threshold cannot exceed tax-at-threshold + excess-over-threshold. Compute the relief and reduce surcharge accordingly.
- Cess: 4% Health & Education Cess on (tax + surcharge) AFTER 87A rebate and AFTER surcharge marginal relief.
- ORDER OF OPERATIONS (strict): (1) slab tax + special-rate tax → (2) apply 87A rebate (with marginal relief where applicable) → (3) apply surcharge (with 15% cap on cap-gains tax, with marginal relief) → (4) apply 4% cess on (rebated tax + surcharge) → (5) subtract TDS / advance tax / self-assessment tax → (6) net payable or refund.
- Special rates (applied on respective income amounts, NOT via slabs):
  * STCG § 111A = 20% (on-or-after 23-Jul-2024 transfers). Pre-23-Jul-2024 = 15% — if extraction provides stcg_pre_jul2024 and stcg_post_jul2024 separately, apply both rates.
  * LTCG § 112A = 12.5% on gains above ₹1,25,000 threshold (on-or-after 23-Jul-2024); pre-23-Jul-2024 LTCG uses 10% above ₹1,00,000. FMV grandfathering pre-31.01.2018 applies.
  * LTCG § 112 = 12.5% without indexation (on-or-after 23-Jul-2024); pre-23-Jul-2024 = 20% with indexation (taxpayer may elect). Residents on land/building acquired before 23-Jul-2024 have option of 20%-with-indexation or 12.5%-without — pick the LOWER and note the choice in assumptions (LEGAL_POSITION).
  * VDA § 115BBH = 30% flat. Losses cannot be set off against any income. No Chapter VI-A deductions.
  * Online games § 115BBJ = 30%. Lottery § 115BB = 30%.

REGIME-AWARE DEDUCTION RULES:
- NEW regime allows ONLY: § 16(ia) standard deduction (₹75,000 or salary, whichever lower); § 80CCD(2) employer NPS (capped at 14% of salary for central-govt and corporate employees post FA2024, 10% otherwise); § 80CCH(2) Agniveer; § 24(b) interest on LET-OUT house property only; § 57(iia) family pension (1/3 of pension or ₹25,000 whichever lower — raised from ₹15,000 by FA2024); transport allowance for divyang.
- OLD regime allows all Chapter VI-A (80C ₹1.5L cap, 80CCD(1B) ₹50k extra, 80D health insurance, 80E education loan, 80G donations, 80TTA ₹10k / 80TTB ₹50k for seniors, 80EE/80EEA home loan, etc.); HRA § 10(13A) least-of-three; LTA § 10(5); § 16(iii) professional tax; § 24(b) for self-occupied up to ₹2L combined cap.
- § 80G cash donations > ₹2,000 are DISALLOWED. Flag in assumptions if extraction reports cash_disallowed_over_2000 = true.
- Home loan § 24(b) self-occupied cap ₹2L combined; let-out no cap but HP loss set-off against other heads capped at ₹2L (excess carried forward 8 yr under § 71B).

STANDARD DEDUCTION — SALARY GATING:
Apply ₹75,000 (NEW) / ₹50,000 (OLD) ONLY when the assessee has salary income OR family pension. If no salary and no family pension, standard deduction is ZERO. Never apply standard deduction to pure business / capital gains / interest income.

SET-OFF & CARRY-FORWARD ORDER (§§ 70–80):
(1) Intra-head set-off first (same source rules — STCL can offset STCG or LTCG; LTCL can offset ONLY LTCG; speculation loss only against speculation gain).
(2) Inter-head set-off (House-Property loss capped at ₹2L against other heads; business loss cannot offset salary; capital loss cannot offset other heads).
(3) Carry forward unabsorbed losses — HP loss 8 yr, business loss 8 yr, capital loss 8 yr, speculation loss 4 yr, VDA loss NEVER.
Populate carryForwardLosses[] with each remaining loss.

AGRICULTURAL INCOME — PARTIAL INTEGRATION:
If agricultural income > ₹5,000 AND non-agri income exceeds basic exemption, apply rate-averaging:
  step_A = tax on (non_agri_income + agri_income) using slabs
  step_B = tax on (basic_exemption_limit + agri_income) using slabs
  effective_tax_on_slabs = step_A − step_B
Compute under BOTH regimes. Document every step in agriculturalIncome.partialIntegrationSteps as a human-readable string. Use the correct basic-exemption limit for the regime & age category.

HOW TO USE THE EXTRACTED INPUT:
The input \`extractedDocuments\` is an array of { docType, originalName, extracted } objects. For each docType, read the relevant fields directly. Cross-reference TDS: Form 16 tds_deducted_total + AIS/26AS tds_entries + interest-certificate tds_deducted_194A should reconcile. Populate tdsReconciliation with every source. Tolerance for match: absolute difference ≤ ₹10 OR relative difference ≤ 0.5%. Flag larger mismatches.
If multiple docs of the same type are present (e.g. 2 pay slips, 3 bank statements), aggregate them in Python.
If a doc's extracted block is null/missing, skip it silently — the extraction step couldn't process it; mention in assumptions only if the doc type is material (Form 16, bank statement).
DO NOT re-derive line items from narrations — extraction already did that. The unclassifiedCredits[] array must ONLY contain items that extraction flagged as unclassified in bank-statement output. If extraction produced no unclassified credits, return unclassifiedCredits: [].

CONFIDENCE SCORING:
- HIGH: all material documents present (Form 16 if salary, bank stmt if interest/biz, broker P&L if cap gains, AIS/26AS for TDS); no DATA_GAP assumptions that move tax > ₹5,000.
- MEDIUM: one material doc missing OR DATA_GAP assumptions moving tax ₹5,000–₹25,000.
- LOW: multiple material docs missing OR DATA_GAP assumptions moving tax > ₹25,000 OR extraction errors on primary docs.
Always populate confidenceExplanation with the specific reasons (2–3 sentences).

FLAGS — colour semantics:
- RED  : compliance risk, likely wrong tax, missing primary doc impacting > ₹25k, audit trigger crossed (e.g. § 44AB turnover).
- AMBER: soft risk — DATA_GAP ₹5k–₹25k impact, borderline regime choice (diff < ₹2,000), unclassified credits present.
- BLUE : informational — data-integrity check passed, marginal relief applied, 112 option exercised.
- GREEN: positive — refund available, advance-tax fully paid, all TDS reconciled.

DATA INTEGRITY (self-check before emitting):
Run Python to verify (tolerance ₹1):
(a) sum of line-item oldRegimeAmount in each head == head.oldRegimeTotal (same for new);
(b) sum of heads + special incomes == grossTotalIncome (each regime);
(c) GTI − deductions == taxableIncome (each regime);
(d) For each regime: (taxOnSlabIncome + taxOnSpecialRate − section87ARebate + surcharge) × 1.04 should equal ((tax_pre_cess) + cess), and that − TDS − advanceTax == netPayableOrRefund.
Any mismatch > ₹1 → fix before emitting. Add a BLUE flag "Data Integrity Check" with the balance evidence. DO NOT loop more than THREE times attempting to reconcile; if still failing, emit with an AMBER flag and list the residual delta.

OUTPUT FORMAT — CRITICAL:
Your FINAL message must contain the JSON payload wrapped between these exact sentinels:

${RESULT_OPEN}
{ ...TaxResult JSON... }
${RESULT_CLOSE}

Nothing before ${RESULT_OPEN} and nothing after ${RESULT_CLOSE} will be parsed. Python traces, code-execution outputs, and reasoning may appear elsewhere in the message and will be ignored. Do NOT nest these sentinels inside code blocks. Do NOT add markdown fences. The JSON must parse with JSON.parse().

TaxResult shape:
{
  assesseeDetails: { name, pan, assessmentYear, governingLaw, residency, ageCategory, aiConfidence: "HIGH"|"MEDIUM"|"LOW", confidenceExplanation, documentStatuses: Array<{ name, status: "extracted"|"partial"|"missing", note }> },
  assumptions: Array<{ category: "DATA_GAP"|"INSTRUCTION_DERIVED"|"LEGAL_POSITION", item, description, impact, howToFix? }>,
  agriculturalIncome?: { amount, explanation, partialIntegrationSteps },
  incomeHeads: Array<{ type: "SALARY"|"HOUSE_PROPERTY"|"PGBP"|"CAPITAL_GAINS"|"OTHER_SOURCES", name, sectionRef, oldRegimeTotal, newRegimeTotal, lineItems: Array<{ name, source, section, oldRegimeAmount, newRegimeAmount, provision? }> }>,
  grossTotalIncome: { oldRegime, newRegime },
  deductions: { oldRegime: Array<{ section, name, amount, limit?, breakdown?, law, plainEnglish }>, newRegime: [], totalOld, totalNew, lostInNewRegime },
  taxableIncome: { oldRegime, newRegime },
  taxComputation: {
    oldRegime: {
      slabs, specialRateIncomes, taxOnSlabIncome, taxOnSpecialRate, totalTaxBeforeRebate,
      section87ARebate, section87AEligible, section87AMarginalReliefApplied: boolean,
      taxAfterRebate, surcharge, surchargeRate, surchargeMarginalReliefApplied: boolean,
      capGainsSurchargeCapApplied: boolean, cess, grossTaxLiability, netTaxLiability,
      tdsCredits, advanceTaxPaid, selfAssessmentTaxPaid, netPayableOrRefund, calcTrace?: string
    },
    newRegime: { ...same shape... }
  },
  regimeDecision: { winner: "OLD"|"NEW", savings, reasons: string[], whatWouldFlip: string[], isCloseCall: boolean /* true when |savings| < 2000 */ },
  carryForwardLosses: Array<{ type, amount, rule, section }>,
  flags: Array<{ type: "RED"|"GREEN"|"AMBER"|"BLUE", title, description }>,
  tdsReconciliation: Array<{ source, tdsInDoc, tdsInAIS: number|null, match: boolean|null, delta?: number }>,
  unclassifiedCredits: Array<{ date, description, amount }>,
  advanceTaxNote?: { netPayable, installments: Array<{ date, percentage }> }
}

Use "Assessment Year (AY)" terminology. Never "Tax Year" or "Previous Year". Plain-English explanations in regimeDecision.reasons target a lay user. isCloseCall is true when |savings| < ₹2,000.`;

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const MAX_RETRIES = 3;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetryGemini = (status: number, message: string): boolean => {
  const m = (message || "").toLowerCase();
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    m.includes("overloaded") ||
    m.includes("rate limit") ||
    m.includes("quota") ||
    m.includes("try again") ||
    m.includes("unavailable")
  );
};

const parseJsonPayload = (textContent: string): unknown => {
  // Prefer sentinel-delimited payload — immune to Python trace contamination.
  const openIdx = textContent.indexOf(RESULT_OPEN);
  const closeIdx = textContent.lastIndexOf(RESULT_CLOSE);
  if (openIdx !== -1 && closeIdx !== -1 && closeIdx > openIdx) {
    const inner = textContent.slice(openIdx + RESULT_OPEN.length, closeIdx).trim();
    const cleaned = inner.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    return JSON.parse(cleaned);
  }
  // Legacy fallback — still protect against a model that ignores the sentinel
  // convention. Strip fences and take the LAST top-level object (not the first
  // Python-dict literal the old regex greedily matched).
  const cleaned = textContent.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  // Scan for the last balanced { ... } block.
  let depth = 0;
  let lastOpen = -1;
  let lastCloseOfOuter = -1;
  let lastOpenOfOuter = -1;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "{") {
      if (depth === 0) lastOpen = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        lastOpenOfOuter = lastOpen;
        lastCloseOfOuter = i;
      }
    }
  }
  if (lastOpenOfOuter !== -1 && lastCloseOfOuter !== -1) {
    return JSON.parse(cleaned.slice(lastOpenOfOuter, lastCloseOfOuter + 1));
  }
  return JSON.parse(cleaned);
};

type ExtractedDoc = {
  docType?: string;
  originalName?: string;
  extracted?: unknown;
  error?: string;
};

type ParsedDocLegacy = { classifiedType?: string; originalName?: string; extractedText?: string };

const buildPrompt = (opts: {
  assesseeSetup: unknown;
  extractedDocuments?: ExtractedDoc[];
  parsedDocuments?: ParsedDocLegacy[]; // backwards-compat
  userInstructions: string;
}): string => {
  const extractedBlock =
    opts.extractedDocuments && opts.extractedDocuments.length > 0
      ? opts.extractedDocuments
          .map(
            (d, i) =>
              `## Document ${i + 1}: ${d.originalName || "unnamed"} [${d.docType || "OTHER"}]\n` +
              (d.error
                ? `Extraction error: ${d.error}`
                : "```json\n" + JSON.stringify(d.extracted ?? {}, null, 2) + "\n```"),
          )
          .join("\n\n")
      : opts.parsedDocuments && opts.parsedDocuments.length > 0
        ? `(Fallback: raw OCR text from parse-documents — treat cautiously.)\n` +
          opts.parsedDocuments
            .map(
              (d) =>
                `[${d.classifiedType || "OTHER"}] ${d.originalName || "unnamed"}:\n${
                  (d.extractedText || "").substring(0, 20000) || "(no text extracted)"
                }`,
            )
            .join("\n\n---\n\n")
        : "No documents provided.";

  return `ASSESSEE SETUP:
${JSON.stringify(opts.assesseeSetup ?? {}, null, 2)}

EXTRACTED DOCUMENTS (pre-normalized JSON from Stage 2):
${extractedBlock}

USER INSTRUCTIONS:
${opts.userInstructions || "(none)"}

Now compute the tax liability under both regimes. Use Code Execution (Python) for every arithmetic step including slab calc, 87A rebate (with marginal relief near ₹12L new regime), surcharge (with 15% cap on cap-gains tax and marginal relief at thresholds), and cess. Wrap the FINAL TaxResult JSON between the sentinels ${RESULT_OPEN} and ${RESULT_CLOSE} exactly. Any text outside the sentinels is ignored.`;
};

const extractTextFromGemini = (result: unknown): { text: string; finishReason: string; blockReason: string | null } => {
  const r = result as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    promptFeedback?: { blockReason?: string };
  };
  const parts = r?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .join("")
    .trim();
  return {
    text,
    finishReason: r?.candidates?.[0]?.finishReason || "UNKNOWN",
    blockReason: r?.promptFeedback?.blockReason ?? null,
  };
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { assesseeSetup, extractedDocuments, parsedDocuments, userInstructions } = body as {
      assesseeSetup?: unknown;
      extractedDocuments?: ExtractedDoc[];
      parsedDocuments?: ParsedDocLegacy[];
      userInstructions?: string;
    };

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || DEFAULT_GEMINI_MODEL;

    if (!GOOGLE_AI_API_KEY) {
      return new Response(
        JSON.stringify({
          error:
            "GOOGLE_AI_API_KEY is not configured. Add it as a Supabase Edge Function secret (Project → Edge Functions → Secrets).",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userText = buildPrompt({
      assesseeSetup,
      extractedDocuments,
      parsedDocuments,
      userInstructions: userInstructions || "",
    });
    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        send({ type: "log", status: "done", message: "Applying tax law to extracted data..." });
        send({
          type: "log",
          status: "working",
          message: `Sending to Gemini (${GEMINI_MODEL}) with Code Execution...`,
        });

        try {
          let geminiResponse: Response | null = null;
          let lastErrorMessage = "";

          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            GEMINI_MODEL,
          )}:generateContent?key=${encodeURIComponent(GOOGLE_AI_API_KEY)}`;

          const requestBody = {
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: userText }] }],
            tools: [{ codeExecution: {} }],
            generationConfig: {
              temperature: 0.0,
              maxOutputTokens: 32000,
              // responseMimeType: "application/json" is INCOMPATIBLE with codeExecution —
              // JSON shape is enforced via the system instruction + sentinel markers.
            },
          };

          for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            const response = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestBody),
            });

            if (response.ok) {
              geminiResponse = response;
              send({ type: "log", status: "done", message: "Gemini accepted the request" });
              break;
            }

            const errText = await response.text();
            lastErrorMessage = errText || `HTTP ${response.status}`;
            console.error(
              "Gemini API error:",
              `attempt ${attempt}/${MAX_RETRIES}`,
              response.status,
              errText.substring(0, 500),
            );

            if (attempt < MAX_RETRIES && shouldRetryGemini(response.status, lastErrorMessage)) {
              const delayMs = Math.min(8000, 800 * Math.pow(2, attempt - 1));
              send({
                type: "log",
                status: "working",
                message: `Gemini is busy. Retrying in ${Math.round(delayMs / 1000)}s (${attempt}/${MAX_RETRIES})...`,
              });
              await sleep(delayMs);
              continue;
            }
            break;
          }

          if (!geminiResponse) {
            send({
              type: "log",
              status: "error",
              message: `AI API error: ${lastErrorMessage || "Unknown"}`,
            });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          send({ type: "log", status: "done", message: "Running Python for slab, surcharge, cess..." });
          send({ type: "log", status: "done", message: "Comparing Old vs New Regime..." });

          const geminiResult = await geminiResponse.json();
          const { text: textContent, finishReason, blockReason } = extractTextFromGemini(geminiResult);

          if (blockReason) {
            console.error("Gemini blocked prompt:", blockReason, JSON.stringify(geminiResult).substring(0, 500));
            send({ type: "log", status: "error", message: `Gemini blocked the request: ${blockReason}` });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          if (!textContent) {
            console.error("No usable text in Gemini response:", JSON.stringify(geminiResult).substring(0, 500));
            send({
              type: "log",
              status: "error",
              message: `No response from Gemini (finishReason: ${finishReason})`,
            });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          if (finishReason === "MAX_TOKENS") {
            console.error("Gemini hit MAX_TOKENS — response likely truncated");
            send({
              type: "log",
              status: "error",
              message: "Response was truncated (hit output token limit). Please retry — we'll allocate more room.",
            });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          let result: unknown;
          try {
            result = parseJsonPayload(textContent);
          } catch (parseErr) {
            console.error("JSON parse failed:", (parseErr as Error).message, textContent.substring(0, 500));
            send({
              type: "log",
              status: "error",
              message: "Gemini returned a response I couldn't parse as JSON. Please retry.",
            });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          send({ type: "result", data: result });
          send({ type: "log", status: "done", message: "Computation complete — report ready!" });
        } catch (e) {
          const err = e as Error;
          console.error("compute-tax stream error:", err);
          send({ type: "log", status: "error", message: err?.message || "Computation failed" });
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    const err = e as Error;
    console.error("compute-tax error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
