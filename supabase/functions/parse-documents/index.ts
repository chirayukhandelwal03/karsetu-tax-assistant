import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";

const classifierKeywords: Record<string, string[]> = {
  FORM_16: ["certificate under section 203", "form no. 16", "details of salary paid", "tds certificate", "form 16", "employer"],
  FORM_26AS: ["annual tax statement", "tax credit statement", "form 26as"],
  AIS: ["annual information statement", "derived information", "ais"],
  BANK_STATEMENT: ["hdfc bank", "state bank of india", "icici bank", "axis bank", "kotak mahindra", "narration", "withdrawal amt", "deposit amt", "balance", "transaction date", "account number"],
  CAPITAL_GAINS: ["zerodha", "groww", "upstox", "realised p&l", "speculative", "capital gains report", "profit & loss", "short term", "long term", "equity", "mutual fund", "isin"],
  PAY_SLIP: ["pay slip", "earnings", "deductions", "net pay", "employee id", "payslip", "basic salary", "hra"],
  INTEREST_CERTIFICATE: ["certificate of interest", "principal outstanding", "interest paid", "home loan", "education loan", "outstanding balance"],
  PREMIUM_RECEIPT: ["premium receipt", "policy no", "life insured", "premium amount", "insurance premium", "lic", "term plan"],
  DONATION_RECEIPT: ["donation receipt", "80g", "registration no", "charitable", "trust"],
  PREVIOUS_ITR: ["return of income", "itr-", "acknowledgement number", "schedule cfl", "income tax return"],
};

const classifyDocument = (text: string, slotType: string): { type: string; confidence: "HIGH" | "MEDIUM" | "LOW"; keyDataFound: string[] } => {
  if (slotType && slotType !== "OTHER_DOCUMENTS") {
    return { type: slotType, confidence: "HIGH", keyDataFound: [`User-specified as ${slotType}`] };
  }

  const lowerText = text.toLowerCase();
  for (const [docType, keywords] of Object.entries(classifierKeywords)) {
    const matches = keywords.filter((kw) => lowerText.includes(kw.toLowerCase()));
    if (matches.length >= 2) {
      return { type: docType, confidence: "HIGH", keyDataFound: matches };
    }
    if (matches.length === 1) {
      return { type: docType, confidence: "MEDIUM", keyDataFound: matches };
    }
  }

  return { type: "OTHER_DOCUMENT", confidence: "LOW", keyDataFound: [] };
};

const extractTextBasic = (base64: string, mimeType: string): string => {
  try {
    if (mimeType.includes("text") || mimeType.includes("csv")) {
      return atob(base64);
    }
    const binary = atob(base64);
    let text = "";
    for (let i = 0; i < binary.length; i++) {
      const code = binary.charCodeAt(i);
      if (code >= 32 && code < 127) {
        text += binary[i];
      } else if (code === 10 || code === 13 || code === 9) {
        text += " ";
      }
    }
    return text.replace(/\s+/g, " ").trim().substring(0, 8000);
  } catch {
    return "";
  }
};

const useGeminiForOCR = async (base64: string, mimeType: string, fileName: string, apiKey: string): Promise<string> => {
  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const prompt = `Extract ALL text content from this financial document (${fileName}).
Extract every number, name, date, and label you can see. This is an Indian financial/tax document.
Focus on extracting:
- Income amounts (salary, interest, dividends, etc.)
- TDS amounts and sources
- Dates and periods
- Names and PAN numbers
- Account numbers
- All tax figures

Output ONLY the extracted text content in a clean format, no commentary.`;

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
      }),
    });

    if (!response.ok) {
      console.error("Gemini OCR error:", response.status);
      return extractTextBasic(base64, mimeType);
    }

    const result = await response.json();
    const extractedText = result.candidates?.[0]?.content?.parts
      ?.map((part: any) => part?.text ?? "")
      .join("")
      .trim();

    return extractedText || extractTextBasic(base64, mimeType);
  } catch (e) {
    console.error("OCR error:", e);
    return extractTextBasic(base64, mimeType);
  }
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { files } = await req.json();

    if (!files || !Array.isArray(files) || files.length === 0) {
      return new Response(JSON.stringify({ documents: [], totalFiles: 0, errors: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY") || "AIzaSyC5CLypupD7D0nmVJoFyvJY6HZCt4OEeL4";
    const documents = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const mimeType = file.type || "application/octet-stream";
        let extractedText = "";

        const canUseAI = GOOGLE_AI_API_KEY && (mimeType.startsWith("image/") || mimeType === "application/pdf");
        if (canUseAI) {
          extractedText = await useGeminiForOCR(file.base64 || "", mimeType, file.name, GOOGLE_AI_API_KEY!);
        } else {
          extractedText = extractTextBasic(file.base64 || "", mimeType);
        }

        const { type: classifiedType, confidence, keyDataFound } = classifyDocument(extractedText, file.slotType || "");

        documents.push({
          originalName: file.name,
          classifiedType,
          extractedText: extractedText.substring(0, 6000),
          keyDataFound,
          confidence,
          parsingNotes: [
            `File type: ${mimeType}`,
            `Classified as: ${classifiedType}`,
            `Confidence: ${confidence}`,
            canUseAI ? "AI OCR used for extraction" : "Basic text extraction used",
          ],
        });
      } catch (e: any) {
        errors.push(`Failed to parse ${file.name}: ${e?.message || "Unknown error"}`);
      }
    }

    return new Response(JSON.stringify({ documents, totalFiles: documents.length, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("parse-documents error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
