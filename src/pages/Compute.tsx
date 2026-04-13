import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Info, Upload, X, FileText, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { AssesseeSetup, TaxpayerType, AssessmentYear, ResidencyStatus, AgeCategory, DocumentSlot, UploadedFile, LogEntry, ComputeState } from "@/types/tax";
import { createDocumentSlots, SUGGESTION_CHIPS, AY_OPTIONS } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const STEPS = ["Setup", "Documents", "Instructions", "Processing"];

const Compute = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [state, setState] = useState<ComputeState>({
    step: 1,
    assesseeSetup: {},
    documentSlots: createDocumentSlots(),
    instructions: "",
    sessionId: crypto.randomUUID(),
    logEntries: [],
    progress: 0,
    isProcessing: false,
    error: null,
    result: null,
  });

  const setStep = (step: ComputeState["step"]) => setState((s) => ({ ...s, step }));
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const isStep1Complete = state.assesseeSetup.type && state.assesseeSetup.assessmentYear && state.assesseeSetup.residencyStatus && state.assesseeSetup.ageCategory;

  const totalFiles = state.documentSlots.reduce((sum, s) => sum + s.files.length, 0);
  const totalSize = state.documentSlots.reduce((sum, s) => sum + s.files.reduce((fs, f) => fs + f.size, 0), 0);

  const handleFileUpload = useCallback((slotType: string, files: FileList | null) => {
    if (!files) return;
    setState((s) => {
      const newSlots = s.documentSlots.map((slot) => {
        if (slot.type !== slotType) return slot;
        const newFiles: UploadedFile[] = [];
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          if (f.size > 10 * 1024 * 1024) {
            toast({ title: "File too large", description: `${f.name} is ${(f.size / 1024 / 1024).toFixed(1)}MB. Maximum is 10MB.`, variant: "destructive" });
            continue;
          }
          newFiles.push({ id: crypto.randomUUID(), file: f, name: f.name, size: f.size, slotType: slot.type });
        }
        return { ...slot, files: [...slot.files, ...newFiles] };
      });
      return { ...s, documentSlots: newSlots };
    });
  }, [toast]);

  const removeFile = (slotType: string, fileId: string) => {
    setState((s) => ({
      ...s,
      documentSlots: s.documentSlots.map((slot) =>
        slot.type === slotType ? { ...slot, files: slot.files.filter((f) => f.id !== fileId) } : slot
      ),
    }));
  };

  const addLogEntry = (entry: LogEntry) => {
    setState((s) => ({ ...s, logEntries: [...s.logEntries, entry] }));
  };

  const startComputation = async () => {
    setState((s) => ({ ...s, step: 4, isProcessing: true, error: null, logEntries: [], progress: 0 }));

    const addLog = (status: LogEntry["status"], message: string) => {
      const entry: LogEntry = { id: crypto.randomUUID(), status, message };
      setState((s) => ({ ...s, logEntries: [...s.logEntries, entry] }));
    };

    try {
      addLog("done", `Documents received — ${totalFiles} files · ${(totalSize / 1024 / 1024).toFixed(1)} MB total`);
      setState((s) => ({ ...s, progress: 10 }));

      // Convert files to base64
      addLog("working", "Parsing uploaded documents...");
      const filesData = [];
      for (const slot of state.documentSlots) {
        for (const f of slot.files) {
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(",")[1]);
            reader.readAsDataURL(f.file);
          });
          filesData.push({ name: f.name, type: f.file.type, base64, slotType: f.slotType });
        }
      }
      setState((s) => ({ ...s, progress: 25 }));

      // Call parse-documents
      let parsedDocs: unknown[] = [];
      if (filesData.length > 0) {
        const { data: parseResult, error: parseError } = await supabase.functions.invoke("parse-documents", {
          body: { files: filesData },
        });
        if (parseError) throw new Error(parseError.message);
        parsedDocs = parseResult?.documents || [];
        addLog("done", `${parsedDocs.length} documents parsed and classified`);
      } else {
        addLog("warning", "No documents uploaded — computation based on instructions only");
      }
      setState((s) => ({ ...s, progress: 40 }));

      // Call compute-tax with streaming
      addLog("working", "Applying tax law under Income Tax Act 1961...");

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/compute-tax`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          assesseeSetup: state.assesseeSetup,
          parsedDocuments: parsedDocs,
          userInstructions: state.instructions,
          sessionId: state.sessionId,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        let errorMessage = "Computation failed";

        try {
          const parsedError = JSON.parse(errText);
          errorMessage = parsedError.error || errorMessage;
        } catch {
          errorMessage = errText || errorMessage;
        }

        throw new Error(errorMessage);
      }

      // Process streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let nlIdx: number;
          while ((nlIdx = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, nlIdx);
            buffer = buffer.slice(nlIdx + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") break;
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.type === "log") {
                addLog(parsed.status, parsed.message);
                setState((s) => ({ ...s, progress: Math.min(90, s.progress + 5) }));
              } else if (parsed.type === "result") {
                fullResponse = JSON.stringify(parsed.data);
              }
            } catch { /* ignore malformed SSE line */ }
          }
        }
      }

      setState((s) => ({ ...s, progress: 95 }));
      addLog("done", "Both Old Regime and New Regime computed");
      addLog("done", "Computation complete — your report is ready");

      // Parse and store result
      let result;
      try {
        result = fullResponse ? JSON.parse(fullResponse) : null;
      } catch {
        result = null;
      }

      setState((s) => ({ ...s, progress: 100, isProcessing: false, result }));

      // Store in sessionStorage for result page
      if (result) {
        sessionStorage.setItem("karsetu_result", JSON.stringify(result));
        sessionStorage.setItem("karsetu_setup", JSON.stringify(state.assesseeSetup));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An error occurred";
      addLog("error", message);
      setState((s) => ({ ...s, isProcessing: false, error: message }));
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Progress Bar */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-3">
            {STEPS.map((label, i) => {
              const stepNum = (i + 1) as 1 | 2 | 3 | 4;
              const isCurrent = state.step === stepNum;
              const isComplete = state.step > stepNum;
              return (
                <div key={label} className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${isComplete ? "bg-green-light text-white" : isCurrent ? "bg-blue-light text-white" : "bg-border text-muted-text"}`}>
                    {isComplete ? <Check size={16} /> : stepNum}
                  </div>
                  <span className={`text-sm hidden sm:inline ${isCurrent ? "text-blue-light font-semibold" : isComplete ? "text-green-light" : "text-muted-text"}`}>{label}</span>
                </div>
              );
            })}
          </div>
          <Progress value={(state.step / 4) * 100} className="h-1.5" />
        </div>

        <AnimatePresence mode="wait">
          {/* STEP 1: Assessee Setup */}
          {state.step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 className="font-heading font-bold text-2xl text-ink mb-2">Tell us about you</h2>
              <p className="text-muted-text mb-8">We need a few details to apply the right tax rules.</p>

              {/* Taxpayer Type */}
              <div className="mb-8">
                <label className="font-semibold text-ink text-sm mb-3 block">Type of Taxpayer</label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { type: "INDIVIDUAL" as TaxpayerType, icon: "👤", title: "Individual", desc: "Any person: salaried, freelancer, investor, business owner", active: true },
                    { type: "HUF" as TaxpayerType, icon: "👨‍👩‍👧‍👦", title: "HUF", desc: "Hindu Undivided Family as a single taxpayer", active: true },
                    { type: null, icon: "🔒", title: "Firm / Partnership", desc: "Coming soon", active: false },
                    { type: null, icon: "🔒", title: "Company", desc: "Coming soon", active: false },
                  ]).map((opt) => (
                    <button
                      key={opt.title}
                      disabled={!opt.active}
                      onClick={() => opt.type && setState((s) => ({ ...s, assesseeSetup: { ...s.assesseeSetup, type: opt.type } }))}
                      className={`p-4 rounded-lg border text-left transition-all ${!opt.active ? "opacity-50 cursor-not-allowed bg-muted" : state.assesseeSetup.type === opt.type ? "border-blue-light bg-blue-pale shadow-sm" : "border-border hover:border-blue-mid"}`}
                    >
                      <span className="text-2xl">{opt.icon}</span>
                      <div className="font-semibold text-sm text-ink mt-1">{opt.title}</div>
                      <div className="text-xs text-muted-text mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Assessment Year */}
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-1">
                  <label className="font-semibold text-ink text-sm">Which Assessment Year are you computing for?</label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info size={14} className="text-muted-text" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs p-4">
                      <p className="font-semibold mb-1">What is Assessment Year?</p>
                      <p className="text-xs">You earn money during a financial year (April to March). The year AFTER that, when you file your return, is the Assessment Year (AY). Example: Earned April 2025 → March 2026 → File in AY 2026-27.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-xs text-muted-text mb-2">The Assessment Year is the year AFTER you earned your income, when you file your return.</p>
                <Select
                  value={state.assesseeSetup.assessmentYear}
                  onValueChange={(v) => setState((s) => ({ ...s, assesseeSetup: { ...s.assesseeSetup, assessmentYear: v as AssessmentYear } }))}
                >
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select Assessment Year" /></SelectTrigger>
                  <SelectContent>
                    {AY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        <div>{o.label} <span className="text-muted-text ml-2 text-xs">{o.period}</span></div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Residency Status */}
              <div className="mb-8">
                <label className="font-semibold text-ink text-sm mb-3 block">Residency Status</label>
                <div className="space-y-2">
                  {([
                    { value: "RESIDENT_OR" as ResidencyStatus, icon: "🏠", title: "Resident Indian (Ordinary Resident)", desc: "I live in India. My income from anywhere in the world is taxable in India." },
                    { value: "RNOR" as ResidencyStatus, icon: "✈️", title: "Resident but Not Ordinarily Resident (RNOR)", desc: "I recently came back to India from abroad." },
                    { value: "NON_RESIDENT" as ResidencyStatus, icon: "🌍", title: "Non-Resident (NR)", desc: "I live abroad. Only my India-sourced income is taxable." },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setState((s) => ({ ...s, assesseeSetup: { ...s.assesseeSetup, residencyStatus: opt.value } }))}
                      className={`w-full p-3 rounded-lg border text-left transition-all flex items-start gap-3 ${state.assesseeSetup.residencyStatus === opt.value ? "border-blue-light bg-blue-pale" : "border-border hover:border-blue-mid"}`}
                    >
                      <span className="text-xl mt-0.5">{opt.icon}</span>
                      <div>
                        <div className="font-semibold text-sm text-ink">{opt.title}</div>
                        <div className="text-xs text-muted-text">{opt.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Age Category */}
              <div className="mb-8">
                <label className="font-semibold text-ink text-sm mb-1 block">Age Category</label>
                <p className="text-xs text-muted-text mb-3">As of 31st March of the income year</p>
                <div className="space-y-2">
                  {([
                    { value: "BELOW_60" as AgeCategory, icon: "👤", title: "Below 60 years", desc: "Basic exemption: ₹2,50,000 (Old Regime)" },
                    { value: "SENIOR_60_79" as AgeCategory, icon: "👵", title: "Senior Citizen (60 to 79 years)", desc: "Basic exemption: ₹3,00,000 (Old Regime)" },
                    { value: "SUPER_SENIOR_80" as AgeCategory, icon: "👴", title: "Super Senior Citizen (80 years and above)", desc: "Basic exemption: ₹5,00,000 (Old Regime)" },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setState((s) => ({ ...s, assesseeSetup: { ...s.assesseeSetup, ageCategory: opt.value } }))}
                      className={`w-full p-3 rounded-lg border text-left transition-all flex items-start gap-3 ${state.assesseeSetup.ageCategory === opt.value ? "border-blue-light bg-blue-pale" : "border-border hover:border-blue-mid"}`}
                    >
                      <span className="text-xl mt-0.5">{opt.icon}</span>
                      <div>
                        <div className="font-semibold text-sm text-ink">{opt.title}</div>
                        <div className="text-xs text-muted-text">{opt.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <Button
                disabled={!isStep1Complete}
                onClick={() => setStep(2)}
                className="w-full bg-blue-light hover:bg-blue-mid text-white font-semibold py-6"
              >
                Continue →
              </Button>
            </motion.div>
          )}

          {/* STEP 2: Document Upload */}
          {state.step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 className="font-heading font-bold text-2xl text-ink mb-2">Upload Your Documents</h2>
              <p className="text-muted-text mb-8 text-sm">Upload as many as you have. The more you upload, the more accurate your computation. You can also continue with zero documents if you'll type everything in instructions.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {state.documentSlots.map((slot) => (
                  <div key={slot.type} className="border border-border rounded-lg p-4 bg-white">
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-2xl">{slot.icon}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${slot.badge === "Strongly Recommended" ? "bg-blue-pale text-blue-deep" : slot.badge === "Recommended" ? "bg-blue-pale text-blue-mid" : "bg-muted text-muted-text"}`}>
                        {slot.badge}
                      </span>
                    </div>
                    <h4 className="font-semibold text-sm text-ink mb-1">{slot.name}</h4>
                    <p className="text-xs text-muted-text mb-2 leading-relaxed">{slot.description}</p>
                    {slot.note && <p className="text-xs text-blue-mid mb-2">{slot.note}</p>}
                    {slot.infoBox && (
                      <div className="bg-blue-pale rounded-md p-2 mb-2 text-xs text-blue-deep leading-relaxed">{slot.infoBox}</div>
                    )}

                    {/* Uploaded files */}
                    {slot.files.map((f) => (
                      <div key={f.id} className="flex items-center gap-2 bg-green-pale rounded-md px-2 py-1 mb-1 text-xs">
                        <FileText size={12} className="text-green-mid" />
                        <span className="text-ink truncate flex-1">{f.name}</span>
                        <span className="text-muted-text">{(f.size / 1024).toFixed(0)}KB</span>
                        <button onClick={() => removeFile(slot.type, f.id)}><X size={12} className="text-muted-text hover:text-kred" /></button>
                      </div>
                    ))}

                    {/* Upload zone */}
                    <div
                      className="border-2 border-dashed border-border rounded-md p-3 text-center cursor-pointer hover:border-blue-mid hover:bg-blue-pale/30 transition-all mt-2"
                      onClick={() => fileInputRefs.current[slot.type]?.click()}
                      onDrop={(e) => { e.preventDefault(); handleFileUpload(slot.type, e.dataTransfer.files); }}
                      onDragOver={(e) => e.preventDefault()}
                    >
                      <Upload size={16} className="mx-auto text-muted-text mb-1" />
                      <p className="text-xs text-muted-text">Click or drop files</p>
                      <input
                        ref={(el) => { fileInputRefs.current[slot.type] = el; }}
                        type="file"
                        multiple
                        accept={slot.accepts.join(",")}
                        className="hidden"
                        onChange={(e) => handleFileUpload(slot.type, e.target.files)}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between bg-white border border-border rounded-lg p-4">
                <span className="text-sm text-ink">{totalFiles} documents uploaded · {(totalSize / 1024 / 1024).toFixed(1)} MB total</span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
                  <Button onClick={() => setStep(3)} className="bg-blue-light hover:bg-blue-mid text-white font-semibold">
                    Continue with {totalFiles} Documents →
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Instructions */}
          {state.step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 className="font-heading font-bold text-2xl text-ink mb-2">Any Special Instructions?</h2>
              <p className="text-muted-text mb-6 text-sm">Tell us anything your documents don't show — exactly as you'd tell your CA. This is optional but improves accuracy significantly.</p>

              <Textarea
                value={state.instructions}
                onChange={(e) => setState((s) => ({ ...s, instructions: e.target.value.slice(0, 5000) }))}
                placeholder="Examples:
• Treat all UPI credits in my HDFC account as income from my freelance software work
• I paid ₹35,000 rent per month in Pune — my landlord's PAN is ABCDE1234F
• I have a home loan with SBI — the property in Nagpur is self-occupied
• The ₹2,00,000 credit from my father is a gift, not income
• I have ₹40,000 Long-Term Capital Loss carried forward from last year
• I am a practicing doctor — apply Section 44ADA for my professional income"
                className="min-h-[200px] mb-4 text-sm"
              />

              <div className="flex flex-wrap gap-2 mb-4">
                {SUGGESTION_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => setState((s) => ({ ...s, instructions: (s.instructions ? s.instructions + "\n• " : "• ") + chip }))}
                    className="text-xs bg-blue-pale text-blue-deep px-3 py-1.5 rounded-full hover:bg-blue-light hover:text-white transition-colors"
                  >
                    + {chip}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between mb-6">
                <span className="text-xs text-muted-text">{state.instructions.length} / 5000 characters</span>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>← Back</Button>
                <Button onClick={startComputation} className="flex-1 bg-green-light hover:bg-green-mid text-white font-semibold py-6 text-lg">
                  Compute My Taxes →
                </Button>
              </div>
            </motion.div>
          )}

          {/* STEP 4: Processing */}
          {state.step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 className="font-heading font-bold text-2xl text-ink mb-2">Computing Your Taxes...</h2>
              <p className="text-muted-text mb-6 text-sm">Our AI is reading your documents and applying current tax law. This takes 30–90 seconds.</p>

              {/* Live log */}
              <div className="bg-ink rounded-xl p-6 mb-6 min-h-[300px] max-h-[400px] overflow-y-auto">
                {state.logEntries.map((entry, i) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="flex items-start gap-2 mb-2"
                  >
                    <span className="text-sm mt-0.5">
                      {entry.status === "working" && "⏳"}
                      {entry.status === "done" && "✅"}
                      {entry.status === "warning" && "⚠️"}
                      {entry.status === "error" && "❌"}
                    </span>
                    <span className="font-mono text-sm text-white/90">{entry.message}</span>
                  </motion.div>
                ))}
                {state.isProcessing && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-2 h-2 bg-green-light rounded-full animate-pulse" />
                    <span className="font-mono text-sm text-white/50">Processing...</span>
                  </div>
                )}
              </div>

              <Progress value={state.progress} className="mb-6 h-2" />

              {state.error && (
                <div className="bg-kred-pale border border-kred/30 rounded-lg p-4 mb-4">
                  <h3 className="font-semibold text-ink mb-1">Something went wrong</h3>
                  <p className="text-sm text-ink-soft mb-3">{state.error}</p>
                  <Button onClick={startComputation} variant="outline">Retry →</Button>
                </div>
              )}

              {state.progress === 100 && !state.isProcessing && !state.error && (
                <Button
                  onClick={() => navigate("/result")}
                  className="w-full bg-green-light hover:bg-green-mid text-white font-semibold py-6 text-lg"
                >
                  Your computation is ready! →
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Footer />
    </div>
  );
};

export default Compute;
