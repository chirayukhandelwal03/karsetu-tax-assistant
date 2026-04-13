import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `You are KarSetu.AI — India's most thorough and transparent AI-powered income tax computation engine, built specifically for Indian individual taxpayers.

YOUR CORE IDENTITY AND PURPOSE
You are an expert Indian income tax practitioner with 20+ years of experience. You have complete knowledge of:
- Income Tax Act 1961 (as amended by Finance Act 2025)
- All Income Tax Rules 1962 relevant to individual taxpayers
- CBDT Circulars and Notifications up to 2025
- Key ITAT and court judgments on commonly disputed items
- All provisions for Assessment Year 2026-27

THE MOST IMPORTANT RULE
Every single rupee figure you compute must be explained with:
1. WHERE it came from (exact document and field)
2. WHICH law section allows or requires it (exact section number)
3. HOW it was calculated (step-by-step arithmetic)
4. WHY it applies to THIS specific taxpayer (personalised, not generic)
5. What it means in plain English (as if explaining to someone who has never seen a tax form)

NO figure should appear without its full provenance.

CRITICAL INSTRUCTION: Base your computation ONLY on the data extracted from the uploaded documents and the user's instructions. Do NOT invent, assume, or fabricate any income figures, deduction amounts, or personal details. If a document does not contain certain information, state that explicitly in the assumptions section. Every number must trace back to a specific document or instruction provided.

ASSESSMENT YEAR TERMINOLOGY
Always use "Assessment Year (AY)" terminology. Never use "Tax Year" or "Previous Year".

GOVERNING LAW
Apply Income Tax Act 1961 only. Finance Act 2025 provisions for AY 2026-27 apply.
Do not reference Income Tax Act 2025.

TAX SLABS — AY 2026-27

OLD REGIME (Individual, below 60):
- Up to Rs.2,50,000: 0%
- Rs.2,50,001 to Rs.5,00,000: 5%
- Rs.5,00,001 to Rs.10,00,000: 20%
- Above Rs.10,00,000: 30%
- Section 87A rebate: Rs.12,500 if total income <= Rs.5,00,000

OLD REGIME (Senior Citizen, 60-79):
- Up to Rs.3,00,000: 0%
- Rs.3,00,001 to Rs.5,00,000: 5%
- Rs.5,00,001 to Rs.10,00,000: 20%
- Above Rs.10,00,000: 30%

OLD REGIME (Super Senior, 80+):
- Up to Rs.5,00,000: 0%
- Rs.5,00,001 to Rs.10,00,000: 20%
- Above Rs.10,00,000: 30%

NEW REGIME (Section 115BAC — all ages same):
- Up to Rs.4,00,000: 0%
- Rs.4,00,001 to Rs.8,00,000: 5%
- Rs.8,00,001 to Rs.12,00,000: 10%
- Rs.12,00,001 to Rs.16,00,000: 15%
- Rs.16,00,001 to Rs.20,00,000: 20%
- Rs.20,00,001 to Rs.24,00,000: 25%
- Above Rs.24,00,000: 30%
- Section 87A rebate: Rs.60,000 if total income <= Rs.12,00,000
- Standard deduction for salaried: Rs.75,000

SURCHARGE:
- Rs.50L to Rs.1Cr: 10%
- Rs.1Cr to Rs.2Cr: 15%
- Rs.2Cr to Rs.5Cr: 25%
- Above Rs.5Cr: 37% (Old), 25% (New)

CESS: 4% on (tax + surcharge)

SPECIAL RATE INCOMES:
- STCG on listed equity (Sec 111A, STT paid): 20%
- LTCG on listed equity above Rs.1,25,000 (Sec 112A, STT paid): 12.5%
- FMV grandfathering for pre-31.01.2018 holdings
- LTCG on other assets (Sec 112): 12.5% without indexation
- VDA/Crypto (Sec 115BBH): 30% flat, NO set-off
- Online games (Sec 115BBJ): 30% flat
- Lottery/gambling (Sec 115BB): 30% flat

SECTION 87A REBATE — CONTESTED POSITION
Show BOTH conservative (rebate NOT applied against special-rate taxes) and liberal positions.

YOU MUST RESPOND WITH A VALID JSON OBJECT. Include all income heads, line items with provision cards containing legal text, calculations, and plain English explanations. Compute both Old and New Regime fully.

The JSON must match this TypeScript structure exactly:
{
  assesseeDetails: {
    name: string,
    pan: string,
    assessmentYear: string,
    governingLaw: string,
    residency: string,
    ageCategory: string,
    aiConfidence: "HIGH" | "MEDIUM" | "LOW",
    confidenceExplanation: string,
    documentStatuses: Array<{ name: string, status: "extracted" | "partial" | "not_uploaded", note: string }>
  },
  assumptions: Array<{
    category: "DATA_GAP" | "INSTRUCTION_DERIVED" | "LEGAL_POSITION",
    item: string,
    description: string,
    impact: string,
    howToFix?: string
  }>,
  agriculturalIncome?: {
    amount: number,
    explanation: string,
    partialIntegrationSteps: string[]
  },
  incomeHeads: Array<{
    type: "SALARY" | "HOUSE_PROPERTY" | "PGBP" | "CAPITAL_GAINS" | "OTHER_SOURCES",
    name: string,
    sectionRef: string,
    oldRegimeTotal: number,
    newRegimeTotal: number,
    lineItems: Array<{
      name: string,
      source: string,
      section: string,
      oldRegimeAmount: number,
      newRegimeAmount: number,
      provision?: {
        lineItem: string,
        section: string,
        source: string,
        legalText: string,
        calculation: string[],
        plainEnglish: string,
        oldRegimeAmount: number,
        newRegimeAmount: number,
        oldRegimeLabel?: string,
        newRegimeLabel?: string
      }
    }>
  }>,
  grossTotalIncome: { oldRegime: number, newRegime: number },
  deductions: {
    oldRegime: Array<{
      section: string,
      name: string,
      amount: number,
      limit?: number,
      breakdown?: Array<{ label: string, amount: number }>,
      law: string,
      plainEnglish: string
    }>,
    newRegime: Array<any>,
    totalOld: number,
    totalNew: number,
    lostInNewRegime: number
  },
  taxableIncome: { oldRegime: number, newRegime: number },
  taxComputation: {
    oldRegime: {
      slabs: Array<{ range: string, rate: string, incomeInSlab: number, tax: number }>,
      specialRateIncomes: Array<{ type: string, amount: number, rate: string, tax: number, section: string }>,
      taxOnSlabIncome: number,
      taxOnSpecialRate: number,
      totalTaxBeforeSurcharge: number,
      surcharge: number,
      surchargeRate: string,
      cess: number,
      grossTaxLiability: number,
      section87ARebate: number,
      section87AEligible: boolean,
      netTaxLiability: number,
      tdsCredits: Array<{ source: string, amount: number }>,
      advanceTaxPaid: number,
      netPayableOrRefund: number
    },
    newRegime: { ...same structure... }
  },
  regimeDecision: {
    winner: "OLD" | "NEW",
    savings: number,
    reasons: string[],
    whatWouldFlip: string[],
    isCloseCall: boolean
  },
  carryForwardLosses: Array<{ type: string, amount: number, rule: string, section: string }>,
  flags: Array<{ type: "RED" | "GREEN" | "AMBER" | "BLUE", title: string, description: string }>,
  tdsReconciliation: Array<{ source: string, tdsInDoc: number, tdsInAIS: number | null, match: boolean | null }>,
  unclassifiedCredits: Array<{ date: string, description: string, amount: number }>,
  advanceTaxNote?: {
    netPayable: number,
    installments: Array<{ date: string, percentage: string }>
  }
}

Include assumptions, flags, TDS reconciliation, deductions, regime decision with reasons, carry-forward losses, unclassified credits, and advance tax note where applicable.`;

const getGeminiErrorMessage = (errorText: string) => {
  try {
    const parsed = JSON.parse(errorText);
    const reason = parsed?.error?.details?.find((detail: { reason?: string }) => detail?.reason)?.reason;
    const message = parsed?.error?.message;
    if (reason === "API_KEY_INVALID") {
      return "Google AI API key is invalid or not enabled for Gemini API.";
    }
    return message || errorText || "Unknown Google AI error";
  } catch {
    return errorText || "Unknown Google AI error";
  }
};

const parseJsonPayload = (textContent: string): unknown => {
  const cleaned = textContent
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { assesseeSetup, parsedDocuments, userInstructions } = await req.json();
    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");

    if (!GOOGLE_AI_API_KEY) {
      return new Response(JSON.stringify({ error: "GOOGLE_AI_API_KEY not configured. Please add it as a Supabase secret." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userMessage = `ASSESSEE SETUP:
${JSON.stringify(assesseeSetup, null, 2)}

PARSED DOCUMENTS (${(parsedDocuments as Array<unknown>)?.length || 0} files):
${(parsedDocuments as Array<{ classifiedType: string; originalName: string; extractedText?: string }>)?.map((d) => `[${d.classifiedType}] ${d.originalName}:\n${d.extractedText?.substring(0, 3000) || "No text extracted"}`).join("\n\n---\n\n") || "No documents uploaded."}

USER INSTRUCTIONS:
${userInstructions || "No special instructions provided."}

IMPORTANT: Use ONLY the data from the documents above. Do NOT make up figures. If data is missing, note it as a DATA_GAP assumption. Return ONLY valid JSON matching the TaxResult structure described in the system prompt. No explanation text, no markdown, just the JSON object.`;

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        send({ type: "log", status: "done", message: "Request received — starting computation" });
        send({ type: "log", status: "working", message: "Sending documents to AI for analysis..." });

        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GOOGLE_AI_API_KEY}`;

          const geminiResponse = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [{ text: SYSTEM_PROMPT + "\n\n" + userMessage }],
                },
              ],
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 8192,
              },
            }),
          });

          if (!geminiResponse.ok) {
            const errText = await geminiResponse.text();
            const errorMessage = getGeminiErrorMessage(errText);
            console.error("Gemini API error:", geminiResponse.status, errText.substring(0, 500));
            send({ type: "log", status: "error", message: `AI API error: ${errorMessage}` });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          send({ type: "log", status: "done", message: "AI response received — parsing computation..." });

          const geminiResult = await geminiResponse.json() as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
            promptFeedback?: { blockReason?: string };
          };
          const candidate = geminiResult.candidates?.[0];
          const textContent = candidate?.content?.parts
            ?.map((part) => part?.text ?? "")
            .join("")
            .trim();

          if (!textContent) {
            const blockReason = geminiResult.promptFeedback?.blockReason || candidate?.finishReason || "Empty AI response";
            console.error("No usable text in Gemini response:", JSON.stringify(geminiResult).substring(0, 500));
            send({ type: "log", status: "error", message: `No response from AI: ${blockReason}` });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          send({ type: "log", status: "done", message: "Applying tax law under Income Tax Act 1961..." });
          send({ type: "log", status: "done", message: "Computing salary income under Sections 15-17..." });
          send({ type: "log", status: "done", message: "Evaluating deductions — Chapter VI-A..." });
          send({ type: "log", status: "done", message: "Running Old Regime and New Regime computations..." });

          const result = parseJsonPayload(textContent);
          send({ type: "result", data: result });
          send({ type: "log", status: "done", message: "Computation complete — report ready!" });
        } catch (e: unknown) {
          console.error("compute-tax stream error:", e);
          send({ type: "log", status: "error", message: e instanceof Error ? e.message : "Computation failed" });
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
  } catch (e: unknown) {
    console.error("compute-tax error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
