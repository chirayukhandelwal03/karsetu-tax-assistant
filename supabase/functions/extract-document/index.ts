import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// extract-document — Stage 2 of the 3-stage pipeline.
// Takes ONE classified document's OCR text and returns strict, typed JSON
// conforming to a per-doc-type schema. No tax math here — extraction only.
// Gemini's responseSchema + responseMimeType is used so we can't silently
// drop line items the way a free-form text response can.
// NOTE: codeExecution is intentionally NOT enabled here — it's incompatible
// with strict JSON schema output, and extraction doesn't need Python anyway.

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
let corsHeaders: Record<string, string> = buildCorsHeaders(null);

// ---------------------------------------------------------------------------
// Per-document-type Gemini response schemas (OpenAPI subset Gemini supports).
// Keep schemas focused on what compute-tax actually consumes. Use STRING for
// dates (ISO or raw) and NUMBER for money.
// ---------------------------------------------------------------------------

const moneyField = { type: "NUMBER" as const, description: "Rupees. 0 if absent." };
const strOptional = { type: "STRING" as const };

const SCHEMA_FORM_16 = {
  type: "OBJECT",
  properties: {
    employer: {
      type: "OBJECT",
      properties: {
        name: strOptional,
        tan: strOptional,
        pan: strOptional,
        period_from: strOptional,
        period_to: strOptional,
      },
    },
    assessee: {
      type: "OBJECT",
      properties: { name: strOptional, pan: strOptional },
    },
    salary_breakup: {
      type: "OBJECT",
      properties: {
        section_17_1_salary: moneyField,
        section_17_2_perquisites: moneyField,
        section_17_3_profits_in_lieu: moneyField,
        gross_salary: moneyField,
      },
    },
    section_10_exemptions: {
      type: "OBJECT",
      properties: {
        hra_10_13A: moneyField,
        lta_10_5: moneyField,
        gratuity_10_10: moneyField,
        leave_encashment_10_10AA: moneyField,
        other: moneyField,
        total: moneyField,
      },
    },
    section_16_deductions: {
      type: "OBJECT",
      properties: {
        standard_deduction: moneyField,
        entertainment_allowance_16_ii: moneyField,
        professional_tax_16_iii: moneyField,
      },
    },
    chapter_via_deductions: {
      type: "OBJECT",
      properties: {
        sec_80C: moneyField,
        sec_80CCC: moneyField,
        sec_80CCD_1: moneyField,
        sec_80CCD_1B: moneyField,
        sec_80CCD_2: moneyField,
        sec_80D: moneyField,
        sec_80E: moneyField,
        sec_80G: moneyField,
        sec_80TTA: moneyField,
        sec_80TTB: moneyField,
        sec_80EEA: moneyField,
        sec_24b_interest: moneyField,
        other: moneyField,
      },
    },
    tds_deducted_total: moneyField,
    tax_payable_per_employer: moneyField,
    regime_chosen_by_employer: { type: "STRING" as const, description: "OLD or NEW or UNKNOWN" },
    notes: { type: "STRING" as const, description: "Anything flagged: inconsistency, partial data, unusual perks." },
  },
  required: ["salary_breakup", "tds_deducted_total"],
};

const SCHEMA_PAY_SLIP = {
  type: "OBJECT",
  properties: {
    employer_name: strOptional,
    employee_name: strOptional,
    month: strOptional,
    days_payable: { type: "NUMBER" as const },
    days_lop: { type: "NUMBER" as const },
    earnings: {
      type: "OBJECT",
      properties: {
        basic: moneyField,
        hra: moneyField,
        da: moneyField,
        special_allowance: moneyField,
        lta: moneyField,
        conveyance: moneyField,
        medical: moneyField,
        bonus: moneyField,
        other: moneyField,
        gross: moneyField,
      },
    },
    deductions: {
      type: "OBJECT",
      properties: {
        pf_employee: moneyField,
        professional_tax: moneyField,
        tds: moneyField,
        loan_emi: moneyField,
        other: moneyField,
      },
    },
    net_pay: moneyField,
    ytd: {
      type: "OBJECT",
      properties: {
        gross_ytd: moneyField,
        tds_ytd: moneyField,
        pf_ytd: moneyField,
      },
    },
    estimated_annual_gross_if_one_slip: moneyField,
    notes: strOptional,
  },
  required: ["earnings", "net_pay"],
};

const SCHEMA_BANK_STATEMENT = {
  type: "OBJECT",
  properties: {
    bank_name: strOptional,
    account_last4: strOptional,
    period_from: strOptional,
    period_to: strOptional,
    credits: {
      type: "ARRAY",
      description: "EVERY credit line in the statement. Not a sample.",
      items: {
        type: "OBJECT",
        properties: {
          date: { type: "STRING" as const },
          description: { type: "STRING" as const },
          amount: { type: "NUMBER" as const },
          bucket: {
            type: "STRING" as const,
            description:
              "One of: DIVIDEND | INTEREST_SAVINGS | INTEREST_FD | BUYBACK_TENDER | REFUND_NON_INCOME | LRS_OUTWARD | LOAN_OR_SELF_TRANSFER | BUSINESS_RECEIPT | SALARY | RENT | GIFT | UNCLASSIFIED",
          },
          bucket_reason: { type: "STRING" as const, description: "One-sentence justification for the bucket." },
        },
        required: ["date", "description", "amount", "bucket"],
      },
    },
    totals_by_bucket: {
      type: "OBJECT",
      properties: {
        dividend: moneyField,
        interest_savings: moneyField,
        interest_fd: moneyField,
        buyback_tender: moneyField,
        refund_non_income: moneyField,
        lrs_outward: moneyField,
        loan_or_self_transfer: moneyField,
        business_receipt: moneyField,
        salary: moneyField,
        rent: moneyField,
        gift: moneyField,
        unclassified: moneyField,
      },
    },
    reconciliation: {
      type: "OBJECT",
      properties: {
        sum_of_credits_enumerated: moneyField,
        sum_of_buckets: moneyField,
        delta: moneyField,
      },
    },
    flags: {
      type: "ARRAY",
      items: { type: "STRING" as const },
      description: "LRS triggered, large cash deposits, unusual patterns, missed pages, etc.",
    },
  },
  required: ["credits", "totals_by_bucket"],
};

const SCHEMA_CAPITAL_GAINS = {
  type: "OBJECT",
  properties: {
    broker_name: strOptional,
    period_from: strOptional,
    period_to: strOptional,
    stcg_equity_listed_111A: moneyField,
    ltcg_equity_listed_112A: moneyField,
    ltcg_equity_exempt_upto_125k_absorbed: moneyField,
    stcg_debt_slab_rate: moneyField,
    ltcg_debt_112: moneyField,
    stcg_other_slab: moneyField,
    intraday_pnl_43_5: moneyField,
    fno_pnl_43_5_d: moneyField,
    mutual_funds: {
      type: "OBJECT",
      properties: {
        equity_stcg: moneyField,
        equity_ltcg: moneyField,
        debt_slab: moneyField,
      },
    },
    dividends_received: moneyField,
    vda_pnl_115BBH: moneyField,
    sheets_seen: {
      type: "ARRAY",
      items: { type: "STRING" as const },
      description: "Names of sheets/sections successfully parsed — user can detect missing ones.",
    },
    sheets_possibly_missing: {
      type: "ARRAY",
      items: { type: "STRING" as const },
    },
    notes: strOptional,
  },
  required: [],
};

const SCHEMA_INTEREST_CERT = {
  type: "OBJECT",
  properties: {
    issuer: strOptional,
    certificate_type: { type: "STRING" as const, description: "BANK_INTEREST | HOME_LOAN | EDUCATION_LOAN | OTHER_LOAN" },
    account_or_loan_no: strOptional,
    period_from: strOptional,
    period_to: strOptional,
    // Bank/FD side
    savings_interest_earned: moneyField,
    fd_interest_earned: moneyField,
    rd_interest_earned: moneyField,
    tds_deducted_194A: moneyField,
    // Home loan side
    interest_paid_fy: moneyField,
    principal_paid_fy: moneyField,
    pre_construction_interest_fy: moneyField,
    sanctioned_amount: moneyField,
    sanctioned_date: strOptional,
    property_value: moneyField,
    property_type: { type: "STRING" as const, description: "self_occupied | let_out | under_construction | unknown" },
    // Education loan side
    education_loan_interest_paid: moneyField,
    notes: strOptional,
  },
  required: ["certificate_type"],
};

const SCHEMA_PREMIUM = {
  type: "OBJECT",
  properties: {
    insurer: strOptional,
    policy_no: strOptional,
    life_insured: strOptional,
    premium_paid_fy: moneyField,
    sum_assured: moneyField,
    plan_type: { type: "STRING" as const, description: "term | endowment | ulip | annuity | pension | health | other" },
    policy_start_date: strOptional,
    eighty_c_eligible_amount: {
      type: "NUMBER" as const,
      description: "Portion eligible under 80C after 10%/20% of SA cap.",
    },
    notes: strOptional,
  },
  required: ["premium_paid_fy"],
};

const SCHEMA_DONATION = {
  type: "OBJECT",
  properties: {
    donee_name: strOptional,
    registration_no: strOptional,
    qualifying_percent: { type: "NUMBER" as const, description: "100 or 50" },
    has_qualifying_limit: { type: "BOOLEAN" as const },
    amount: moneyField,
    payment_mode: { type: "STRING" as const, description: "cash | non_cash | unknown" },
    donation_date: strOptional,
    cash_disallowed_over_2000: { type: "BOOLEAN" as const },
    notes: strOptional,
  },
  required: ["amount"],
};

const SCHEMA_AIS_26AS = {
  type: "OBJECT",
  properties: {
    pan: strOptional,
    assessment_year: strOptional,
    tds_entries: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          deductor_name: strOptional,
          deductor_tan: strOptional,
          section: strOptional,
          amount_paid_credited: moneyField,
          tds_amount: moneyField,
        },
      },
    },
    tcs_entries: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          collector_name: strOptional,
          section: strOptional,
          amount: moneyField,
          tcs_amount: moneyField,
        },
      },
    },
    advance_tax_paid: moneyField,
    self_assessment_tax_paid: moneyField,
    sft_entries: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          sft_code: strOptional,
          description: strOptional,
          amount: moneyField,
        },
      },
    },
    interest_income_reported: moneyField,
    dividend_income_reported: moneyField,
    securities_transactions: moneyField,
    notes: strOptional,
  },
  required: [],
};

const SCHEMA_PREVIOUS_ITR = {
  type: "OBJECT",
  properties: {
    assessment_year: strOptional,
    itr_form: strOptional,
    gross_total_income: moneyField,
    taxable_income: moneyField,
    tax_paid: moneyField,
    refund_received: moneyField,
    carry_forward_losses: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          type: { type: "STRING" as const, description: "HP_LOSS | STCL | LTCL | SPECULATIVE | NON_SPEC_PGBP | OTHER" },
          amount: moneyField,
          year_of_origin: strOptional,
        },
      },
    },
    notes: strOptional,
  },
  required: [],
};

const SCHEMA_OTHER = {
  type: "OBJECT",
  properties: {
    summary: {
      type: "STRING" as const,
      description: "What this document is, in plain English.",
    },
    potentially_relevant_figures: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" as const },
          amount: moneyField,
          context: { type: "STRING" as const },
          likely_treatment: {
            type: "STRING" as const,
            description: "e.g. 'Capital gain', 'Other income', 'Not income', 'Deduction u/s 80C'",
          },
        },
      },
    },
  },
  required: ["summary"],
};

type DocType =
  | "FORM_16"
  | "FORM_26AS"
  | "AIS"
  | "BANK_STATEMENT"
  | "CAPITAL_GAINS"
  | "PAY_SLIP"
  | "INTEREST_CERTIFICATE"
  | "PREMIUM_RECEIPT"
  | "DONATION_RECEIPT"
  | "PREVIOUS_ITR"
  | "OTHER_DOCUMENT";

const SCHEMA_BY_TYPE: Record<DocType, object> = {
  FORM_16: SCHEMA_FORM_16,
  FORM_26AS: SCHEMA_AIS_26AS,
  AIS: SCHEMA_AIS_26AS,
  BANK_STATEMENT: SCHEMA_BANK_STATEMENT,
  CAPITAL_GAINS: SCHEMA_CAPITAL_GAINS,
  PAY_SLIP: SCHEMA_PAY_SLIP,
  INTEREST_CERTIFICATE: SCHEMA_INTEREST_CERT,
  PREMIUM_RECEIPT: SCHEMA_PREMIUM,
  DONATION_RECEIPT: SCHEMA_DONATION,
  PREVIOUS_ITR: SCHEMA_PREVIOUS_ITR,
  OTHER_DOCUMENT: SCHEMA_OTHER,
};

// ---------------------------------------------------------------------------
// Per-type extraction prompts. Kept SHORT and FOCUSED — each is about one job.
// No tax law, no regime logic, no formatting rules. Just "read and transcribe."
// ---------------------------------------------------------------------------

const PROMPT_BASE = `You are a document-to-JSON extraction engine for Indian financial/tax documents.
Your ONLY job is to read the document text below and output strict JSON conforming to the provided schema.

Hard rules:
- Do NOT compute anything. Do NOT apply tax law. Do NOT summarise unless the schema asks for it.
- Read the ENTIRE text, not a sample. List every line item the schema asks for — if the schema has an array, enumerate EVERY matching row.
- Numbers in rupees. If a figure is absent, use 0, not null.
- If a field is ambiguous, pick the best interpretation and add a brief note in the "notes" field.
- Never invent data. If truly not in the document, leave the field at 0 / empty string.

The issuer brand (bank / broker / employer / insurer) does not change your job. Parse by column headers, narration patterns, and section labels — not by brand.

`;

const PROMPT_BY_TYPE: Partial<Record<DocType, string>> = {
  BANK_STATEMENT:
    PROMPT_BASE +
    `This is a BANK STATEMENT (any bank, any format — SBI, HDFC, ICICI, Axis, Kotak, PNB, BoB, IndusInd, IDFC First, Yes, Federal, RBL, AU, co-op bank, etc.).

For credits, classify EACH credit into exactly one bucket:
- DIVIDEND: narrations like "ACH CR GEN", "DIV", "DIVIDEND", "CDSL", "NSDL", registrar names.
- INTEREST_SAVINGS: SB interest, savings account interest.
- INTEREST_FD: FD/RD interest credited.
- BUYBACK_TENDER: "BUYBACK", "TENDER", buyback tender offer proceeds. Post-Oct-2024 = deemed dividend.
- REFUND_NON_INCOME: ITR refund, merchandise refund, UPI reversal, chargeback. NOT income.
- LRS_OUTWARD: actually a DEBIT but sometimes bank statements show bucketed credits from LRS reversals — include if present.
- LOAN_OR_SELF_TRANSFER: loan disbursals, own-account transfers.
- BUSINESS_RECEIPT: freelancing / professional income if user instructions indicate; recurring client payments.
- SALARY: credits from employers.
- RENT: rent received.
- GIFT: clearly labelled gifts.
- UNCLASSIFIED: when uncertain — describe why in bucket_reason.

Enumerate EVERY credit, not a sample. Compute totals_by_bucket and put the reconciliation delta — it MUST be 0 if all credits are accounted for.
Also flag if the statement narrations suggest LRS outward remittances aggregate > ₹7L (possible TCS u/s 206C(1G)).`,

  CAPITAL_GAINS:
    PROMPT_BASE +
    `This is a BROKER capital-gains / P&L report (Zerodha, Groww, Upstox, Angel One, Motilal Oswal, ICICI Direct, HDFC Securities, Kotak, Sharekhan, 5paisa, Dhan, Paytm Money, Fyers, IIFL, or any other — same schema). The file is usually multi-sheet Excel flattened to CSV with sheets for Intraday, STCG, LTCG, F&O, Mutual Funds, Dividends.

For each sheet, sum realised P/L. Classify by holding period + asset class per Indian tax law:
- Equity listed, ≤ 12 months → STCG § 111A (20%).
- Equity listed, > 12 months → LTCG § 112A (12.5% over ₹1.25L).
- Intraday equity → speculative § 43(5) (slab, under PGBP).
- F&O → non-speculative § 43(5)(d) (slab, under PGBP).
- Debt MF bought after 01.04.2023 → always slab (no LTCG).
- VDA (crypto) → § 115BBH (30% flat, no loss set-off).

Report sheets_seen and sheets_possibly_missing so the frontend can ask the user to re-upload truncated sheets.`,

  FORM_16:
    PROMPT_BASE +
    `This is FORM 16 (TDS certificate Part A and/or Part B) issued by ANY employer. It follows the standard TDS-CPC format.

Extract the salary breakup under Section 17, exemptions under Section 10 (HRA, LTA, etc.), deductions under Section 16 (standard deduction, professional tax), and all Chapter VI-A deductions declared by the employer (80C, 80CCD(1B), 80D, 80E, 80G, 24(b) interest if reported as loss from house property, etc.).
Capture tds_deducted_total and tax_payable_per_employer as shown at the foot of Part B. If the employer indicates the regime chosen, record it.`,

  PAY_SLIP:
    PROMPT_BASE +
    `This is a monthly PAY SLIP / salary slip. Employer varies. Extract earnings and deductions for the month and any YTD figures printed.

If only ONE pay slip is provided, estimate estimated_annual_gross_if_one_slip = monthly_gross × (12 − any LWP months inferred). If multiple slips, leave it 0 and the downstream consumer will aggregate.`,

  INTEREST_CERTIFICATE:
    PROMPT_BASE +
    `This is an INTEREST CERTIFICATE. It is either:
(a) Bank/FD interest earned certificate → set certificate_type = BANK_INTEREST; fill savings_interest_earned, fd_interest_earned, rd_interest_earned, tds_deducted_194A.
(b) Home loan interest paid certificate → set certificate_type = HOME_LOAN; fill interest_paid_fy, principal_paid_fy, pre_construction_interest_fy, sanctioned_amount, sanctioned_date, property_value, property_type.
(c) Education loan interest paid certificate → set certificate_type = EDUCATION_LOAN; fill education_loan_interest_paid.

Classify the certificate type first, then only populate the relevant block. Leave the unused fields at 0 / empty string.`,

  PREMIUM_RECEIPT:
    PROMPT_BASE +
    `This is a LIC / life-insurance / health-insurance / pension premium receipt. Record premium_paid_fy and, where visible, sum_assured. Infer plan_type from wording (term / endowment / ulip / annuity / pension / health).
Compute eighty_c_eligible_amount using: premium capped at 10% of sum_assured for policies post 01.04.2012 (20% for 01.04.2003–31.03.2012). If sum_assured unknown, set to premium_paid_fy and add a note.`,

  DONATION_RECEIPT:
    PROMPT_BASE +
    `This is a § 80G donation receipt. Capture qualifying_percent (100 or 50), whether the qualifying limit applies (usually "without qualifying limit" for PM CARES / 100% categories). Set cash_disallowed_over_2000 = true if payment_mode is cash AND amount > 2000.`,

  FORM_26AS:
    PROMPT_BASE +
    `This is FORM 26AS (tax credit statement from TRACES). Enumerate every TDS entry with deductor_name, deductor_tan, section, amount_paid_credited, tds_amount. Same for TCS entries. Capture advance_tax_paid and self_assessment_tax_paid totals.`,

  AIS:
    PROMPT_BASE +
    `This is the ANNUAL INFORMATION STATEMENT (AIS) / Taxpayer Information Summary (TIS). Extract all SFT entries with codes (SFT-016 interest, SFT-017 dividend, SFT-005 high-value transactions, etc.). Extract interest_income_reported and dividend_income_reported totals. Also capture TDS/TCS entries if they appear here rather than 26AS.`,

  PREVIOUS_ITR:
    PROMPT_BASE +
    `This is a PREVIOUSLY FILED ITR (acknowledgement or computation). Capture the headline figures (GTI, taxable income, tax paid, refund received) and — most importantly — any carry-forward losses in Schedule CFL (HP loss, STCL, LTCL, speculative, non-spec PGBP) with year of origin so the downstream tax engine knows what can still be set off.`,

  OTHER_DOCUMENT:
    PROMPT_BASE +
    `This document wasn't auto-classified into a known type. Describe what it appears to be, then list any numeric figures that look financially relevant with context.`,
};

PROMPT_BY_TYPE.FORM_26AS = PROMPT_BY_TYPE.FORM_26AS || PROMPT_BASE;

// ---------------------------------------------------------------------------
// Gemini call with retry (mirrors compute-tax retry policy).
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_RETRIES = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

const callGeminiForExtraction = async (opts: {
  apiKey: string;
  model: string;
  prompt: string;
  schema: object;
  docText: string;
  docName: string;
}): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> => {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    opts.model,
  )}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;

  const userPrompt = `${opts.prompt}\n\nDOCUMENT NAME: ${opts.docName}\n\nDOCUMENT TEXT (OCR / flattened):\n${opts.docText}`;

  const requestBody = {
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 8192,
      // Strict JSON output — the whole point of this stage.
      responseMimeType: "application/json",
      responseSchema: opts.schema,
    },
  };

  let lastErr = "";
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const t = await res.text();
      lastErr = t || `HTTP ${res.status}`;
      console.error("extract-document Gemini error", attempt, res.status, lastErr.substring(0, 400));
      if (attempt < MAX_RETRIES && shouldRetryGemini(res.status, lastErr)) {
        await sleep(Math.min(8000, 800 * Math.pow(2, attempt - 1)));
        continue;
      }
      return { ok: false, error: lastErr };
    }

    const j = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      promptFeedback?: { blockReason?: string };
    };
    if (j.promptFeedback?.blockReason) {
      return { ok: false, error: `Blocked: ${j.promptFeedback.blockReason}` };
    }
    const text =
      j.candidates?.[0]?.content?.parts?.map((p) => p?.text || "").join("").trim() ?? "";
    if (!text) {
      return { ok: false, error: `Empty response (finishReason: ${j.candidates?.[0]?.finishReason || "unknown"})` };
    }
    try {
      return { ok: true, data: JSON.parse(text) };
    } catch (e) {
      console.error("extract-document JSON parse fail:", (e as Error).message, text.substring(0, 300));
      return { ok: false, error: "Gemini returned invalid JSON despite responseSchema." };
    }
  }
  return { ok: false, error: lastErr || "Unknown" };
};

// ---------------------------------------------------------------------------
// Handler — accepts { docType, extractedText, originalName } for ONE document
// OR { docs: [...] } for batch. Returns { extracted } or { results }.
// ---------------------------------------------------------------------------

type ExtractInput = { docType: string; extractedText: string; originalName: string };

const runOne = async (
  input: ExtractInput,
  apiKey: string,
  model: string,
): Promise<{ docType: string; originalName: string; extracted: unknown; error?: string }> => {
  const dt = (input.docType || "OTHER_DOCUMENT") as DocType;
  const schema = SCHEMA_BY_TYPE[dt] ?? SCHEMA_OTHER;
  const prompt = PROMPT_BY_TYPE[dt] ?? PROMPT_BY_TYPE.OTHER_DOCUMENT!;
  const txt = (input.extractedText || "").substring(0, 60000);

  if (!txt.trim()) {
    return {
      docType: dt,
      originalName: input.originalName,
      extracted: null,
      error: "Empty extractedText",
    };
  }

  const r = await callGeminiForExtraction({
    apiKey,
    model,
    prompt,
    schema,
    docText: txt,
    docName: input.originalName,
  });

  if (!r.ok) {
    return { docType: dt, originalName: input.originalName, extracted: null, error: r.error };
  }
  return { docType: dt, originalName: input.originalName, extracted: r.data };
};

Deno.serve(async (req: Request) => {
  corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    const MODEL = Deno.env.get("GEMINI_MODEL") || DEFAULT_MODEL;

    if (!GOOGLE_AI_API_KEY) {
      return new Response(
        JSON.stringify({
          error:
            "GOOGLE_AI_API_KEY is not configured. Add it as a Supabase Edge Function secret (Project → Edge Functions → Secrets).",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Batch mode — extract many docs in parallel.
    if (Array.isArray(body?.docs)) {
      const inputs = (body.docs as ExtractInput[]).slice(0, 25); // safety cap
      const results = await Promise.all(inputs.map((d) => runOne(d, GOOGLE_AI_API_KEY, MODEL)));
      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Single mode.
    const single = body as ExtractInput;
    const r = await runOne(single, GOOGLE_AI_API_KEY, MODEL);
    return new Response(JSON.stringify(r), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const err = e as Error;
    console.error("extract-document error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
