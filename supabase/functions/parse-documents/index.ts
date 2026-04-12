import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { files } = await req.json();

    if (!files || !Array.isArray(files) || files.length === 0) {
      return new Response(JSON.stringify({ documents: [], totalFiles: 0, errors: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const classifierKeywords: Record<string, string[]> = {
      FORM_16: ["Certificate under Section 203", "Form No. 16", "Details of Salary Paid"],
      FORM_26AS: ["Annual Tax Statement", "Tax Credit Statement"],
      AIS: ["Annual Information Statement", "Derived Information"],
      BANK_STATEMENT: ["HDFC BANK", "State Bank of India", "ICICI BANK", "Axis Bank", "Narration", "Withdrawal Amt", "Deposit Amt"],
      CAPITAL_GAINS: ["Zerodha", "Groww", "Realised P&L", "Speculative", "Capital Gains Report"],
      PAY_SLIP: ["Pay Slip", "Earnings", "Deductions", "Net Pay", "Employee ID"],
      INTEREST_CERTIFICATE: ["Certificate of Interest", "Principal Outstanding", "Interest Paid"],
      PREMIUM_RECEIPT: ["Premium Receipt", "Policy No", "Life Insured", "Premium Amount"],
      DONATION_RECEIPT: ["Donation Receipt", "80G", "Registration No"],
      PREVIOUS_ITR: ["Return of Income", "ITR-", "Acknowledgement Number", "Schedule CFL"],
    };

    const documents = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const text = file.base64 ? atob(file.base64).substring(0, 5000) : "";
        
        let classifiedType = "OTHER_DOCUMENT";
        let confidence: "HIGH" | "MEDIUM" | "LOW" = "LOW";
        const keyDataFound: string[] = [];

        for (const [docType, keywords] of Object.entries(classifierKeywords)) {
          const matches = keywords.filter(kw => text.toLowerCase().includes(kw.toLowerCase()));
          if (matches.length > 0) {
            classifiedType = docType;
            confidence = matches.length >= 2 ? "HIGH" : "MEDIUM";
            keyDataFound.push(...matches);
            break;
          }
        }

        if (file.slotType && file.slotType !== "OTHER_DOCUMENTS") {
          classifiedType = file.slotType;
          confidence = "HIGH";
        }

        documents.push({
          originalName: file.name,
          classifiedType,
          extractedText: text,
          keyDataFound,
          confidence,
          parsingNotes: [`Classified as ${classifiedType}`],
        });
      } catch (e) {
        errors.push(`Failed to parse ${file.name}: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    }

    return new Response(JSON.stringify({ documents, totalFiles: documents.length, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
