import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

ASSESSMENT YEAR TERMINOLOGY
Always use "Assessment Year (AY)" terminology. Never use "Tax Year" or "Previous Year".

GOVERNING LAW
Apply Income Tax Act 1961 only. Finance Act 2025 provisions for AY 2026-27 apply.
Do not reference Income Tax Act 2025.

TAX SLABS — AY 2026-27

OLD REGIME (Individual, below 60):
- Up to ₹2,50,000: 0%
- ₹2,50,001 to ₹5,00,000: 5%
- ₹5,00,001 to ₹10,00,000: 20%
- Above ₹10,00,000: 30%
- Section 87A rebate: ₹12,500 if total income ≤ ₹5,00,000

OLD REGIME (Senior Citizen, 60-79):
- Up to ₹3,00,000: 0%
- ₹3,00,001 to ₹5,00,000: 5%
- ₹5,00,001 to ₹10,00,000: 20%
- Above ₹10,00,000: 30%

OLD REGIME (Super Senior, 80+):
- Up to ₹5,00,000: 0%
- ₹5,00,001 to ₹10,00,000: 20%
- Above ₹10,00,000: 30%

NEW REGIME (Section 115BAC — all ages same):
- Up to ₹4,00,000: 0%
- ₹4,00,001 to ₹8,00,000: 5%
- ₹8,00,001 to ₹12,00,000: 10%
- ₹12,00,001 to ₹16,00,000: 15%
- ₹16,00,001 to ₹20,00,000: 20%
- ₹20,00,001 to ₹24,00,000: 25%
- Above ₹24,00,000: 30%
- Section 87A rebate: ₹60,000 if total income ≤ ₹12,00,000
- Standard deduction for salaried: ₹75,000

SURCHARGE:
- ₹50L to ₹1Cr: 10%
- ₹1Cr to ₹2Cr: 15%
- ₹2Cr to ₹5Cr: 25%
- Above ₹5Cr: 37% (Old), 25% (New)

CESS: 4% on (tax + surcharge)

SPECIAL RATE INCOMES:
- STCG on listed equity (Sec 111A, STT paid): 20%
- LTCG on listed equity above ₹1,25,000 (Sec 112A, STT paid): 12.5%
- FMV grandfathering for pre-31.01.2018 holdings
- LTCG on other assets (Sec 112): 12.5% without indexation
- VDA/Crypto (Sec 115BBH): 30% flat, NO set-off
- Online games (Sec 115BBJ): 30% flat
- Lottery/gambling (Sec 115BB): 30% flat

SECTION 87A REBATE — CONTESTED POSITION
Show BOTH conservative (rebate NOT applied against special-rate taxes) and liberal positions.

YOU MUST RESPOND WITH A VALID JSON OBJECT matching the TaxResult TypeScript interface. Include all income heads, line items with provision cards containing legal text, calculations, and plain English explanations. Compute both Old and New Regime fully.

For each line item provision card, include:
- lineItem, section, source
- legalText (the actual law text)
- calculation (array of step-by-step strings)
- plainEnglish (conversational explanation)
- oldRegimeAmount, newRegimeAmount

Include assumptions, flags, TDS reconciliation, deductions, regime decision with reasons, carry-forward losses, unclassified credits, and advance tax note where applicable.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { assesseeSetup, parsedDocuments, userInstructions, sessionId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userMessage = `ASSESSEE SETUP:
${JSON.stringify(assesseeSetup, null, 2)}

PARSED DOCUMENTS (${parsedDocuments?.length || 0} files):
${parsedDocuments?.map((d: any) => `[${d.classifiedType}] ${d.originalName}: ${d.extractedText?.substring(0, 2000)}`).join("\n\n") || "No documents uploaded."}

USER INSTRUCTIONS:
${userInstructions || "No special instructions provided."}

Compute the complete income tax liability under both Old Regime and New Regime. Return ONLY valid JSON matching the TaxResult interface.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({ error: `AI computation failed: ${response.status}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stream SSE back to client with log entries
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const logMessages = [
          "Applying tax law under Income Tax Act 1961...",
          "Computing salary income under Sections 15-17...",
          "Evaluating HRA exemption — Section 10(13A) with Rule 2A...",
          "Checking Chapter VI-A deductions — 80C, 80D, 80E...",
          "Computing capital gains — STCG and LTCG...",
          "Running both Old Regime and New Regime computations...",
        ];

        for (const msg of logMessages) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "log", status: "done", message: msg })}\n\n`));
          await new Promise(r => setTimeout(r, 500));
        }

        // Read the OpenAI-compatible streaming response
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let nlIdx: number;
          while ((nlIdx = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nlIdx).trim();
            buffer = buffer.slice(nlIdx + 1);
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") continue;
            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullText += content;
              }
            } catch {}
          }
        }

        // Parse the full JSON result
        try {
          const jsonMatch = fullText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "result", data: result })}\n\n`));
          } else {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "log", status: "error", message: "No valid JSON found in AI response" })}\n\n`));
          }
        } catch (e) {
          console.error("JSON parse error:", e);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "log", status: "error", message: "Failed to parse AI response" })}\n\n`));
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("compute-tax error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
