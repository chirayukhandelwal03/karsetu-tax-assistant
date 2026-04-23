import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import * as XLSX from "npm:xlsx@0.18.5";

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
// Preserved name for places that reference it — will be reassigned per-request.
let corsHeaders: Record<string, string> = buildCorsHeaders(null);

type AuthHeaderResult = {
  token: string | null;
  error?: string;
  status?: number;
};

const parseBearerToken = (authHeader: string | null): AuthHeaderResult => {
  if (!authHeader) return { token: null };

  const trimmedHeader = authHeader.trim();
  if (!trimmedHeader.toLowerCase().startsWith("bearer ")) {
    return {
      token: null,
      status: 400,
      error: "Malformed Authorization header. Expected format: Bearer <access_token>",
    };
  }

  const token = trimmedHeader.slice(7).trim();
  if (!token) {
    return { token: null, status: 400, error: "Malformed Authorization header. Token is missing after Bearer." };
  }
  if (token.startsWith('"') || token.endsWith('"')) {
    return { token: null, status: 400, error: "Malformed Authorization header. Token must not be wrapped in quotes." };
  }
  if (token.toLowerCase().startsWith("bearer")) {
    return { token: null, status: 400, error: "Malformed Authorization header. Found duplicated Bearer prefix." };
  }
  return { token };
};

// Broker- and bank-agnostic classifier keys based on SEMANTIC CONTENT, not issuer names.
// Any Indian broker (Zerodha, Groww, Upstox, Angel One, Motilal Oswal, ICICI Direct, HDFC Sec,
// Kotak, Sharekhan, 5paisa, Dhan, Paytm Money, Fyers, IIFL, etc.) and any Indian bank
// (SBI, HDFC, ICICI, Axis, Kotak, PNB, BoB, Canara, IndusInd, IDFC First, Yes, Federal,
// RBL, AU SFB, co-op banks, etc.) must be classifiable from pattern alone.
const classifierKeywords: Record<string, string[]> = {
  FORM_16: [
    "certificate under section 203", "form no. 16", "form no.16", "part a", "part b",
    "details of salary paid", "tds certificate", "form 16",
    "tan of the deductor", "traces", "deductor", "deductee",
    "gross salary", "section 17(1)", "section 17(2)", "section 17(3)",
    "income chargeable under the head salaries",
  ],
  FORM_26AS: [
    "annual tax statement", "tax credit statement", "form 26as",
    "tds/tcs details", "tax deducted at source", "part a1", "part g",
  ],
  AIS: [
    "annual information statement", "derived information", "taxpayer information summary", "tis",
    "sft-", "information source", "financial transactions",
  ],
  BANK_STATEMENT: [
    "narration", "description", "withdrawal", "deposit", "closing balance", "opening balance",
    "transaction date", "value date", "chq/ref", "account number", "account statement",
    "ifsc", "branch", "available balance", "debit", "credit", "balance (inr)", "txn date",
  ],
  CAPITAL_GAINS: [
    "realised p&l", "realised profit", "realized p&l", "unrealised p&l",
    "capital gains", "tradewise", "tradewise-exits", "profit & loss",
    "short term", "long term", "stcg", "ltcg", "equity", "mutual fund",
    "isin", "symbol", "buy date", "sell date", "buy value", "sell value",
    "f&o", "futures", "options", "speculative", "intraday", "holding period",
  ],
  PAY_SLIP: [
    "pay slip", "payslip", "salary slip", "earnings", "deductions", "net pay",
    "employee id", "emp id", "basic", "basic salary", "hra", "house rent allowance",
    "special allowance", "conveyance", "da", "pf", "epf", "professional tax",
    "gross pay", "net salary", "lop", "loss of pay", "ctc", "payable days",
  ],
  INTEREST_CERTIFICATE: [
    "certificate of interest", "interest certificate",
    "principal outstanding", "interest paid", "principal paid", "provisional interest",
    "home loan", "housing loan", "education loan", "loan account",
    "sanctioned amount", "disbursed", "outstanding balance", "emi",
    "pre-emi", "pre-construction",
    "interest earned", "interest credited",
    "tds on interest", "section 194a",
  ],
  PREMIUM_RECEIPT: [
    "premium receipt", "policy no", "policy number", "life insured", "life assured",
    "premium amount", "insurance premium", "sum assured", "term plan",
    "endowment", "ulip", "annuity", "pension plan",
  ],
  DONATION_RECEIPT: [
    "donation receipt", "80g", "registration no", "charitable", "trust",
    "receipt of donation", "80gga", "pan of donee",
  ],
  PREVIOUS_ITR: [
    "return of income", "itr-", "itr1", "itr2", "itr3", "itr4",
    "acknowledgement number", "schedule cfl", "income tax return",
    "computation of total income", "schedule cg",
  ],
};

const classifyDocument = (
  text: string,
  slotType: string,
): { type: string; confidence: "HIGH" | "MEDIUM" | "LOW"; keyDataFound: string[] } => {
  if (slotType && slotType !== "OTHER_DOCUMENTS") {
    return { type: slotType, confidence: "HIGH", keyDataFound: [`User-specified as ${slotType}`] };
  }
  const lowerText = text.toLowerCase();
  // Score every candidate type; pick the one with the most keyword hits. Falls back to
  // OTHER_DOCUMENT when nothing matches. Ties break on declaration order (FORM_16 first,
  // then FORM_26AS, etc.), which is fine because the order goes from most-specific to
  // least-specific doc type.
  let best: { type: string; matches: string[] } = { type: "OTHER_DOCUMENT", matches: [] };
  for (const [docType, keywords] of Object.entries(classifierKeywords)) {
    const matches = keywords.filter((kw) => lowerText.includes(kw.toLowerCase()));
    if (matches.length > best.matches.length) best = { type: docType, matches };
  }
  if (best.matches.length >= 3) return { type: best.type, confidence: "HIGH", keyDataFound: best.matches };
  if (best.matches.length >= 1) return { type: best.type, confidence: "MEDIUM", keyDataFound: best.matches };
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
      if (code >= 32 && code < 127) text += binary[i];
      else if (code === 10 || code === 13 || code === 9) text += " ";
    }
    return text.replace(/\s+/g, " ").trim().substring(0, 8000);
  } catch {
    return "";
  }
};

// Decode base64 to Uint8Array (needed for XLSX.read in the Deno runtime).
const base64ToBytes = (base64: string): Uint8Array => {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

// Flatten an Excel workbook to CSV-text-per-sheet. Gemini never sees raw .xlsx bytes —
// per the directive, we convert to CSV strings and pass as text.
// IMPORTANT: Broker P&L workbooks (Zerodha, Groww, Upstox, Angel One, Motilal Oswal,
// ICICI Direct, HDFC Securities, Kotak, etc.) ship multi-sheet workbooks with one sheet
// per gains category (Intraday / STCG / LTCG / F&O / Dividend). A global byte-cap drops
// later sheets silently. We therefore cap PER SHEET so every sheet survives, up to a
// generous workbook ceiling.
const PER_SHEET_CAP = 15000;
const WORKBOOK_CAP = 60000;

const extractExcelToCsv = (base64: string): string => {
  try {
    const bytes = base64ToBytes(base64);
    const wb = XLSX.read(bytes, { type: "array" });
    const chunks: string[] = [];
    let running = 0;
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (!csv.trim()) continue;
      const perSheet = csv.length > PER_SHEET_CAP
        ? `${csv.substring(0, PER_SHEET_CAP)}\n[... sheet truncated at ${PER_SHEET_CAP} chars ...]`
        : csv;
      const block = `[Sheet: ${sheetName}]\n${perSheet}`;
      if (running + block.length > WORKBOOK_CAP) {
        chunks.push(`[Sheet: ${sheetName}] (skipped — workbook cap reached; re-upload this sheet separately if needed)`);
        continue;
      }
      chunks.push(block);
      running += block.length;
    }
    return chunks.join("\n\n");
  } catch (e) {
    console.error("Excel parse failed:", (e as Error).message);
    return "";
  }
};

// JSON passthrough: stringify-pretty so the LLM reads it as structured text.
const extractJsonAsText = (base64: string): string => {
  try {
    const raw = atob(base64);
    try {
      const obj = JSON.parse(raw);
      return JSON.stringify(obj, null, 2).substring(0, 12000);
    } catch {
      return raw.substring(0, 12000);
    }
  } catch {
    return "";
  }
};

const OCR_PROMPT = `Extract ALL text content from this Indian financial/tax document.
Preserve every number, name, date, section reference, PAN, TAN, account number, and label exactly as it appears.

Priorities:
- Income figures (salary components, interest, dividends, capital gains, business receipts)
- TDS amounts and deductor names
- Dates, assessment years, financial years
- Names, PAN, TAN, employer/bank names
- Account numbers and transaction descriptions
- All tax figures (advance tax, self-assessment tax, refund)
- Policy numbers, premium amounts, donation receipts, home-loan interest breakdowns

Output ONLY the extracted plain-text content in a clean, readable format. No commentary, no markdown, no summary.`;

// Gemini native multimodal: images and PDFs go inline; PDF OCR is native.
const GEMINI_INLINE_MIME_ALLOWED = new Set<string>([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const callGeminiOCR = async (
  base64: string,
  mimeType: string,
  apiKey: string,
  model: string,
): Promise<string> => {
  if (!GEMINI_INLINE_MIME_ALLOWED.has(mimeType.toLowerCase())) return "";

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: OCR_PROMPT },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 4096,
    },
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Gemini OCR error:", response.status, errText.substring(0, 500));
    return "";
  }

  const result = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    promptFeedback?: { blockReason?: string };
  };

  if (result?.promptFeedback?.blockReason) {
    console.error("Gemini OCR blocked:", result.promptFeedback.blockReason);
    return "";
  }

  const parts = result?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .join("")
    .trim();
};

Deno.serve(async (req: Request) => {
  corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const authResult = parseBearerToken(authHeader);
    if (authResult.error) {
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: authResult.status ?? 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { files } = await req.json();

    if (!files || !Array.isArray(files) || files.length === 0) {
      return new Response(JSON.stringify({ documents: [], totalFiles: 0, errors: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    const OCR_MODEL = Deno.env.get("GEMINI_OCR_MODEL") || "gemini-2.5-flash";
    const documents: unknown[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const mimeType = (file.type || "application/octet-stream").toLowerCase();
        const name: string = file.name || "unnamed";
        let extractedText = "";
        let ocrUsed = false;
        let parsingPath = "basic";

        const isImage = mimeType.startsWith("image/");
        const isPdf = mimeType === "application/pdf";
        const isJson = mimeType.includes("json") || name.toLowerCase().endsWith(".json");
        const isExcel =
          mimeType.includes("spreadsheetml") ||
          mimeType === "application/vnd.ms-excel" ||
          name.toLowerCase().endsWith(".xls") ||
          name.toLowerCase().endsWith(".xlsx");

        if (isJson) {
          extractedText = extractJsonAsText(file.base64 || "");
          parsingPath = "json-passthrough";
        } else if (isExcel) {
          extractedText = extractExcelToCsv(file.base64 || "");
          parsingPath = "xlsx-to-csv";
        } else {
          const canUseAI = Boolean(GOOGLE_AI_API_KEY) && (isImage || isPdf);
          if (canUseAI) {
            try {
              extractedText = await callGeminiOCR(file.base64 || "", mimeType, GOOGLE_AI_API_KEY!, OCR_MODEL);
              ocrUsed = Boolean(extractedText);
              parsingPath = ocrUsed ? "gemini-vision" : "basic";
            } catch (e) {
              console.error("Gemini OCR threw:", (e as Error).message);
            }
          }
          if (!extractedText) {
            extractedText = extractTextBasic(file.base64 || "", mimeType);
          }
        }

        const { type: classifiedType, confidence, keyDataFound } = classifyDocument(extractedText, file.slotType || "");

        documents.push({
          originalName: name,
          classifiedType,
          extractedText: extractedText.substring(0, 20000),
          keyDataFound,
          confidence,
          parsingNotes: [
            `File type: ${mimeType}`,
            `Classified as: ${classifiedType}`,
            `Confidence: ${confidence}`,
            ocrUsed
              ? `Gemini vision OCR used (${OCR_MODEL})`
              : parsingPath === "xlsx-to-csv"
                ? "Excel flattened to CSV text"
                : parsingPath === "json-passthrough"
                  ? "JSON stringified as text"
                  : "Basic text extraction used",
          ],
        });
      } catch (e) {
        const err = e as Error;
        errors.push(`Failed to parse ${file.name}: ${err?.message || "Unknown error"}`);
      }
    }

    return new Response(JSON.stringify({ documents, totalFiles: documents.length, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const err = e as Error;
    console.error("parse-documents error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
