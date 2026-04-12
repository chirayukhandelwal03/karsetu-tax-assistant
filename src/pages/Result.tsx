import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronDown, ChevronRight, Download, FileSpreadsheet, UserCheck, RotateCcw, Trophy, AlertTriangle, CheckCircle, Info, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import DisclaimerBanner from "@/components/DisclaimerBanner";
import CAConnectModal from "@/components/CAConnectModal";
import { TaxResult, IncomeHead, LineItem, ProvisionCard as ProvisionCardType, Assumption, Flag, DeductionItem, SlabRow, TDSReconciliationRow, CarryForwardLoss, UnclassifiedCredit } from "@/types/tax";
import { getMockResult } from "@/lib/mockResult";

const formatINR = (n: number | undefined | null) => {
  if (n === undefined || n === null || isNaN(Number(n))) return "₹0";
  const num = Number(n);
  if (num < 0) return `(₹${Math.abs(num).toLocaleString("en-IN")})`;
  return `₹${num.toLocaleString("en-IN")}`;
};

const Result = () => {
  const navigate = useNavigate();
  const [result, setResult] = useState<TaxResult | null>(null);
  const [showCAModal, setShowCAModal] = useState(false);
  const [expandedHeads, setExpandedHeads] = useState<Record<string, boolean>>({});
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [showAssumptions, setShowAssumptions] = useState(true);

  useEffect(() => {
    const stored = sessionStorage.getItem("karsetu_result");
    if (stored) {
      try { setResult(JSON.parse(stored)); } catch { setResult(getMockResult()); }
    } else {
      setResult(getMockResult());
    }
  }, []);

  if (!result) return <div className="min-h-screen flex items-center justify-center"><p>Loading...</p></div>;

  const defaultComputation = {
    slabs: [], specialRateIncomes: [], taxOnSlabIncome: 0, taxOnSpecialRate: 0,
    totalTaxBeforeSurcharge: 0, surcharge: 0, surchargeRate: "0%", cess: 0,
    grossTaxLiability: 0, section87ARebate: 0, section87AEligible: false,
    netTaxLiability: 0, tdsCredits: [], advanceTaxPaid: 0, netPayableOrRefund: 0,
  };
  const ad = result.assesseeDetails || { name: "—", pan: "", assessmentYear: "AY 2026-27", governingLaw: "", residency: "", ageCategory: "", aiConfidence: "LOW", confidenceExplanation: "", documentStatuses: [] };
  const rd = result.regimeDecision || { winner: "NEW" as const, savings: 0, reasons: [], whatWouldFlip: [], isCloseCall: false };
  const tc = result.taxComputation || { oldRegime: defaultComputation, newRegime: defaultComputation };
  const oldRegime = tc.oldRegime || defaultComputation;
  const newRegime = tc.newRegime || defaultComputation;
  const winnerLabel = rd.winner === "NEW" ? "New Regime" : "Old Regime";
  const loserLabel = rd.winner === "NEW" ? "Old Regime" : "New Regime";
  const winnerTax = rd.winner === "NEW" ? newRegime.netPayableOrRefund : oldRegime.netPayableOrRefund;
  const loserTax = rd.winner === "NEW" ? oldRegime.netPayableOrRefund : newRegime.netPayableOrRefund;

  const toggleHead = (type: string) => setExpandedHeads((p) => ({ ...p, [type]: !p[type] }));
  const toggleItem = (key: string) => setExpandedItems((p) => ({ ...p, [key]: !p[key] }));

  const handlePrint = () => window.print();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* 7.0 Disclaimer Banner */}
      <DisclaimerBanner />

      {/* 7.1 Sticky Summary Bar */}
      <div className="sticky top-16 z-40 bg-white border-b border-border shadow-sm no-print">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-6">
            <div className={`text-center ${rd.winner === "OLD" ? "" : "opacity-60"}`}>
              <div className="text-xs text-muted-text">Old Regime</div>
              <div className="font-mono-num font-bold text-lg text-ink">{formatINR(oldRegime.netPayableOrRefund)}</div>
            </div>
            <div className="text-center">
              <div className="flex items-center gap-1 text-green-light font-semibold text-sm">
                <Trophy size={14} /> {winnerLabel} recommended
              </div>
              <div className="text-xs text-muted-text">You save {formatINR(rd.savings)}</div>
            </div>
            <div className={`text-center ${rd.winner === "NEW" ? "" : "opacity-60"}`}>
              <div className="text-xs text-muted-text">New Regime</div>
              <div className="font-mono-num font-bold text-lg text-ink">{formatINR(newRegime.netPayableOrRefund)}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint}><Download size={14} className="mr-1" /> PDF</Button>
            <Button variant="outline" size="sm" onClick={() => setShowCAModal(true)}><UserCheck size={14} className="mr-1" /> Consult CA</Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* 7.2 Assessee Details Card */}
        <section className="bg-white rounded-xl border border-border p-6">
          <h2 className="font-heading font-bold text-lg text-ink mb-4">Assessee Details</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            {[
              ["Name", ad.name || "—"],
              ["PAN", ad.pan ? `•••••${ad.pan.slice(-5)}` : "—"],
              ["Assessment Year", ad.assessmentYear],
              ["Governing Law", ad.governingLaw],
              ["Residency", ad.residency],
              ["Age Category", ad.ageCategory],
            ].map(([label, val]) => (
              <div key={label as string}>
                <div className="text-muted-text text-xs">{label}</div>
                <div className="font-semibold text-ink">{val}</div>
              </div>
            ))}
            <div>
              <div className="text-muted-text text-xs">AI Confidence</div>
              <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${ad.aiConfidence === "HIGH" ? "bg-green-pale text-green-deep" : ad.aiConfidence === "MEDIUM" ? "bg-amber-pale text-amber" : "bg-kred-pale text-kred"}`}>
                {ad.aiConfidence}
              </span>
              <p className="text-xs text-muted-text mt-0.5">{ad.confidenceExplanation}</p>
            </div>
          </div>
          {ad.documentStatuses.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="text-xs font-semibold text-muted-text mb-2">Documents Processed</div>
              <div className="space-y-1">
                {ad.documentStatuses.map((ds, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span>{ds.status === "extracted" ? "✅" : ds.status === "partial" ? "⚠️" : "❌"}</span>
                    <span className="text-ink">{ds.name}</span>
                    <span className="text-muted-text">— {ds.note}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* 7.3 Assumptions Panel */}
        <section className={`rounded-xl border p-6 ${result.assumptions.length > 0 ? "border-l-4 border-l-amber bg-white" : "border-l-4 border-l-green-light bg-green-pale"}`}>
          {result.assumptions.length === 0 ? (
            <div className="flex items-center gap-2">
              <CheckCircle className="text-green-light" size={20} />
              <span className="font-semibold text-ink">Zero Assumptions — All data fully resolved from your documents.</span>
            </div>
          ) : (
            <>
              <button onClick={() => setShowAssumptions(!showAssumptions)} className="flex items-center gap-2 w-full text-left">
                {showAssumptions ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span className="font-heading font-semibold text-ink">{result.assumptions.length} Assumptions Made</span>
              </button>
              {showAssumptions && (
                <div className="mt-4 space-y-3">
                  {result.assumptions.map((a, i) => (
                    <AssumptionCard key={i} assumption={a} />
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* 7.4 Agricultural Income Block */}
        {result.agriculturalIncome && (
          <section className="bg-white rounded-xl border-2 border-green-light/30 p-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🌾</span>
              <h3 className="font-heading font-bold text-ink">Agricultural Income: {formatINR(result.agriculturalIncome.amount)}</h3>
            </div>
            <p className="text-sm text-ink-soft mb-3">{result.agriculturalIncome.explanation}</p>
            <details className="text-sm">
              <summary className="cursor-pointer text-blue-mid font-semibold">See partial integration calculation</summary>
              <ol className="mt-2 space-y-1 text-ink-soft list-decimal ml-5">
                {result.agriculturalIncome.partialIntegrationSteps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </details>
          </section>
        )}

        {/* 7.5 INCOME COMPUTATION — Five Heads Accordion */}
        <section>
          <h2 className="font-heading font-bold text-xl text-ink mb-4 flex items-center gap-2">
            📊 INCOME COMPUTATION <span className="text-xs text-muted-text font-normal">— All figures in ₹</span>
          </h2>

          <div className="space-y-3">
            {result.incomeHeads.map((head) => (
              <IncomeHeadAccordion
                key={head.type}
                head={head}
                expanded={!!expandedHeads[head.type]}
                onToggle={() => toggleHead(head.type)}
                expandedItems={expandedItems}
                onToggleItem={toggleItem}
              />
            ))}
          </div>
        </section>

        {/* Gross Total Income */}
        <div className="bg-blue-deep text-white rounded-xl p-5 flex items-center justify-between">
          <span className="font-heading font-bold">GROSS TOTAL INCOME</span>
          <div className="flex gap-8 text-right">
            <div><div className="text-xs opacity-70">Old Regime</div><div className="font-mono-num font-bold text-lg">{formatINR(result.grossTotalIncome.oldRegime)}</div></div>
            <div><div className="text-xs opacity-70">New Regime</div><div className="font-mono-num font-bold text-lg">{formatINR(result.grossTotalIncome.newRegime)}</div></div>
          </div>
        </div>

        {/* 7.6 Deductions Panel */}
        <section className="bg-white rounded-xl border border-border p-6">
          <h2 className="font-heading font-bold text-lg text-ink mb-4">Step 2: Deductions that Reduce Your Taxable Income</h2>
          <div className="bg-blue-pale rounded-lg p-4 mb-6 text-sm text-blue-deep">
            <span className="font-semibold">📌 KEY DIFFERENCE BETWEEN REGIMES:</span> Under the OLD REGIME, you can claim many deductions (like 80C for investments, 80D for health insurance). Under the NEW REGIME, almost NO deductions are available. But the tax RATES are significantly lower.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-ink text-sm mb-3 flex items-center gap-2">Old Regime Deductions</h3>
              {result.deductions.oldRegime.map((d, i) => <DeductionCard key={i} item={d} />)}
              <div className="mt-3 pt-3 border-t border-border flex justify-between font-semibold text-ink">
                <span>TOTAL DEDUCTIONS</span>
                <span className="font-mono-num">{formatINR(result.deductions.totalOld)}</span>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-ink text-sm mb-3">New Regime Deductions</h3>
              {result.deductions.newRegime.length === 0 ? (
                <p className="text-sm text-muted-text italic">Under New Regime, most deductions are NOT available.</p>
              ) : (
                result.deductions.newRegime.map((d, i) => <DeductionCard key={i} item={d} />)
              )}
              <div className="mt-3 pt-3 border-t border-border flex justify-between font-semibold text-ink">
                <span>TOTAL DEDUCTIONS</span>
                <span className="font-mono-num">{formatINR(result.deductions.totalNew)}</span>
              </div>
              {result.deductions.lostInNewRegime > 0 && (
                <p className="text-xs text-kred mt-2">Deductions you CANNOT claim in New Regime: {formatINR(result.deductions.lostInNewRegime)}</p>
              )}
            </div>
          </div>
        </section>

        {/* 7.7 Taxable Income Row */}
        <div className="bg-ink text-white rounded-xl p-5 flex items-center justify-between">
          <div>
            <span className="font-heading font-bold">TOTAL TAXABLE INCOME</span>
            <p className="text-xs text-white/60 mt-1">Rounded to nearest ₹10 as per Section 288A</p>
          </div>
          <div className="flex gap-8 text-right">
            <div><div className="text-xs opacity-70">Old Regime</div><div className="font-mono-num font-bold text-lg">{formatINR(result.taxableIncome.oldRegime)}</div></div>
            <div><div className="text-xs opacity-70">New Regime</div><div className="font-mono-num font-bold text-lg">{formatINR(result.taxableIncome.newRegime)}</div></div>
          </div>
        </div>

        {/* 7.8 Tax Computation Tables */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <TaxSlabTable
            title="OLD REGIME"
            subtitle="Income Tax Act 1961 — Finance Act 2025"
            computation={oldRegime}
            taxableIncome={result.taxableIncome.oldRegime}
          />
          <TaxSlabTable
            title="NEW REGIME"
            subtitle="Section 115BAC — Finance Act 2025"
            computation={newRegime}
            taxableIncome={result.taxableIncome.newRegime}
          />
        </section>

        {/* 7.9 Regime Decision Panel */}
        <section className={`rounded-xl border-2 p-6 ${rd.winner === "NEW" ? "border-green-light bg-green-pale/50" : "border-blue-light bg-blue-pale/50"}`}>
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="text-green-light" size={24} />
            <h2 className="font-heading font-bold text-xl text-ink">{winnerLabel.toUpperCase()} IS BETTER FOR YOU</h2>
          </div>
          <p className="text-ink-soft text-sm mb-4">You save approximately {formatINR(rd.savings)} by choosing the {winnerLabel}.</p>
          {rd.isCloseCall && (
            <p className="text-sm text-amber mb-4">Both regimes are nearly identical ({formatINR(rd.savings)} difference). You may prefer the New Regime for simplicity.</p>
          )}
          <div className="mb-4">
            <h4 className="font-semibold text-sm text-ink mb-2">WHY {winnerLabel.toUpperCase()} WINS IN YOUR CASE:</h4>
            <ol className="list-decimal ml-5 space-y-1 text-sm text-ink-soft">
              {rd.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ol>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-ink mb-2">WHAT WOULD MAKE {loserLabel.toUpperCase()} BETTER:</h4>
            <ul className="list-disc ml-5 space-y-1 text-sm text-ink-soft">
              {rd.whatWouldFlip.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        </section>

        {/* 7.10 Carry-Forward Losses */}
        {result.carryForwardLosses.length > 0 && (
          <section className="bg-white rounded-xl border border-border p-6">
            <h2 className="font-heading font-bold text-lg text-ink mb-4">Losses — Carry Forward to Next Year</h2>
            <div className="space-y-3">
              {result.carryForwardLosses.map((loss, i) => (
                <div key={i} className="border border-border rounded-lg p-3">
                  <div className="font-semibold text-sm text-ink">{loss.type}</div>
                  <div className="font-mono-num text-ink text-sm">{formatINR(loss.amount)}</div>
                  <p className="text-xs text-muted-text mt-1">{loss.rule} — {loss.section}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-text mt-3">IMPORTANT: Upload this year's ITR to KarSetu.AI next year and these losses will be automatically applied.</p>
          </section>
        )}

        {/* 7.11 Flags & Recommendations */}
        {result.flags.length > 0 && (
          <section>
            <h2 className="font-heading font-bold text-lg text-ink mb-4">Flags & Recommendations</h2>
            <div className="space-y-3">
              {result.flags.map((flag, i) => (
                <FlagCard key={i} flag={flag} />
              ))}
            </div>
          </section>
        )}

        {/* 7.12 TDS Reconciliation */}
        <section className="bg-white rounded-xl border border-border p-6">
          <h2 className="font-heading font-bold text-lg text-ink mb-4">TDS Reconciliation</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-muted-text font-semibold">Source</th>
                  <th className="text-right py-2 text-muted-text font-semibold">TDS in Doc</th>
                  <th className="text-right py-2 text-muted-text font-semibold">TDS in AIS</th>
                  <th className="text-center py-2 text-muted-text font-semibold">Match?</th>
                </tr>
              </thead>
              <tbody>
                {result.tdsReconciliation.map((row, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2 text-ink">{row.source}</td>
                    <td className="py-2 text-right font-mono-num">{formatINR(row.tdsInDoc)}</td>
                    <td className="py-2 text-right font-mono-num">{row.tdsInAIS !== null ? formatINR(row.tdsInAIS) : "—"}</td>
                    <td className="py-2 text-center">{row.match === true ? "✅" : row.match === false ? "❌" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 7.13 Unclassified Credits */}
        {result.unclassifiedCredits.length > 0 && (
          <section className="bg-amber-pale rounded-xl border border-amber/20 p-6">
            <h2 className="font-heading font-semibold text-ink mb-3">A Few Transactions We Set Aside</h2>
            <p className="text-sm text-ink-soft mb-3">While reading your bank statements, we came across some credits whose purpose wasn't clear. We've left these OUT of your income computation for now:</p>
            <ul className="space-y-1 mb-4">
              {result.unclassifiedCredits.map((c, i) => (
                <li key={i} className="text-sm text-ink">• {formatINR(c.amount)} on {c.date} — "{c.description}"</li>
              ))}
            </ul>
            <p className="text-xs text-muted-text">If any of these are income — go back and add an instruction. If they're gifts or your own transfers, they are correctly excluded.</p>
          </section>
        )}

        {/* 7.14 Advance Tax Note */}
        {result.advanceTaxNote && (
          <section className="bg-white rounded-xl border border-border p-6">
            <h2 className="font-heading font-semibold text-ink mb-2">Advance Tax Note</h2>
            <p className="text-sm text-ink-soft mb-3">Your net tax payable ({formatINR(result.advanceTaxNote.netPayable)}) exceeds ₹10,000.</p>
            <p className="text-sm text-ink-soft mb-3">The Income Tax Act requires advance tax to be paid in instalments during the financial year:</p>
            <ul className="space-y-1 mb-3">
              {result.advanceTaxNote.installments.map((inst, i) => (
                <li key={i} className="text-sm text-ink">• By {inst.date}: {inst.percentage} of expected tax</li>
              ))}
            </ul>
            <p className="text-xs text-muted-text">If advance tax was not paid, interest under Section 234B and 234C will be levied. This is typically small — your CA will calculate the exact interest when filing.</p>
          </section>
        )}

        {/* 7.15 Final Disclaimer + Export Actions */}
        <section className="bg-amber-pale border border-amber/30 rounded-xl p-6 mb-4">
          <p className="text-sm text-ink-soft">
            KarSetu.AI is an AI-powered informational tool. This computation is for planning purposes only. It is not professional tax advice. Please verify with a qualified Chartered Accountant or Tax Practitioner before filing your Income Tax Return. Tax law is subject to CBDT circulars, court orders, and amendments — verify current applicability for your specific situation.
          </p>
        </section>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 no-print">
          <Button variant="outline" className="flex items-center gap-2" onClick={handlePrint}>
            <Download size={16} /> Download PDF
          </Button>
          <Button variant="outline" className="flex items-center gap-2">
            <FileSpreadsheet size={16} /> Download Excel
          </Button>
          <Button variant="outline" className="flex items-center gap-2" onClick={() => setShowCAModal(true)}>
            <UserCheck size={16} /> Consult a CA
          </Button>
          <Button variant="outline" className="flex items-center gap-2" onClick={() => { sessionStorage.clear(); navigate("/compute"); }}>
            <RotateCcw size={16} /> Compute Again
          </Button>
        </div>
      </div>

      <Footer />
      <CAConnectModal open={showCAModal} onClose={() => setShowCAModal(false)} />
    </div>
  );
};

// ===== Sub-components =====

const AssumptionCard = ({ assumption: a }: { assumption: Assumption }) => {
  const colors = {
    DATA_GAP: { bg: "bg-amber-pale", border: "border-amber", label: "⚠️ DATA GAP ASSUMPTION", text: "text-amber" },
    INSTRUCTION_DERIVED: { bg: "bg-blue-pale", border: "border-blue-mid", label: "📘 INSTRUCTION-DERIVED", text: "text-blue-deep" },
    LEGAL_POSITION: { bg: "bg-kpurple-pale", border: "border-kpurple", label: "⚖️ LEGAL POSITION", text: "text-kpurple" },
  };
  const c = colors[a.category];
  return (
    <div className={`${c.bg} border ${c.border}/30 rounded-lg p-4`}>
      <div className={`text-xs font-bold ${c.text} mb-2`}>{c.label}</div>
      <div className="font-semibold text-sm text-ink mb-1">{a.item}</div>
      <p className="text-sm text-ink-soft mb-2">{a.description}</p>
      <p className="text-xs text-muted-text">{a.impact}</p>
      {a.howToFix && <p className="text-xs text-blue-mid mt-1">{a.howToFix}</p>}
    </div>
  );
};

const IncomeHeadAccordion = ({ head, expanded, onToggle, expandedItems, onToggleItem }: {
  head: IncomeHead; expanded: boolean; onToggle: () => void;
  expandedItems: Record<string, boolean>; onToggleItem: (key: string) => void;
}) => (
  <div className="bg-white rounded-xl border border-border overflow-hidden">
    {/* Level 1 */}
    <button onClick={onToggle} className="w-full px-5 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3">
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <div className="text-left">
          <h3 className="font-heading font-semibold text-ink text-sm">{head.name}</h3>
          <p className="text-xs text-muted-text font-mono-num">{head.sectionRef}</p>
        </div>
      </div>
      <div className="flex gap-6 text-right">
        <div><div className="text-[10px] text-muted-text">Old</div><div className="font-mono-num font-semibold text-sm text-ink">{formatINR(head.oldRegimeTotal)}</div></div>
        <div><div className="text-[10px] text-muted-text">New</div><div className="font-mono-num font-semibold text-sm text-ink">{formatINR(head.newRegimeTotal)}</div></div>
      </div>
    </button>

    {/* Level 2 */}
    {expanded && (
      <div className="border-t border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 text-xs text-muted-text">
                <th className="text-left px-4 py-2">Line Item</th>
                <th className="text-left px-4 py-2">Source</th>
                <th className="text-left px-4 py-2">Section</th>
                <th className="text-right px-4 py-2">Old Regime</th>
                <th className="text-right px-4 py-2">New Regime</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {head.lineItems.map((item, idx) => {
                const key = `${head.type}-${idx}`;
                return (
                  <LineItemRow key={key} item={item} itemKey={key} expanded={!!expandedItems[key]} onToggle={() => onToggleItem(key)} />
                );
              })}
              {head.subSections?.map((sub, si) => (
                <tr key={`sub-${si}`}>
                  <td colSpan={6} className="px-4 py-2">
                    <div className="font-semibold text-xs text-blue-deep mb-1">{sub.title}</div>
                    <p className="text-xs text-muted-text mb-2">{sub.description}</p>
                    <table className="w-full">
                      <tbody>
                        {sub.lineItems.map((item, idx) => {
                          const key = `${head.type}-sub${si}-${idx}`;
                          return <LineItemRow key={key} item={item} itemKey={key} expanded={!!expandedItems[key]} onToggle={() => onToggleItem(key)} />;
                        })}
                      </tbody>
                    </table>
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/30 font-semibold">
                <td className="px-4 py-2 text-ink" colSpan={3}>NET {head.name.toUpperCase()}</td>
                <td className="px-4 py-2 text-right font-mono-num text-ink">{formatINR(head.oldRegimeTotal)}</td>
                <td className="px-4 py-2 text-right font-mono-num text-ink">{formatINR(head.newRegimeTotal)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )}
  </div>
);

const LineItemRow = ({ item, itemKey, expanded, onToggle }: { item: LineItem; itemKey: string; expanded: boolean; onToggle: () => void }) => (
  <>
    <tr className="border-b border-border/30 hover:bg-muted/20">
      <td className="px-4 py-2 text-ink">{item.name}</td>
      <td className="px-4 py-2 text-muted-text text-xs">{item.source}</td>
      <td className="px-4 py-2 font-mono-num text-xs text-blue-deep">{item.section}</td>
      <td className="px-4 py-2 text-right font-mono-num">{formatINR(item.oldRegimeAmount)}</td>
      <td className="px-4 py-2 text-right font-mono-num">{formatINR(item.newRegimeAmount)}</td>
      <td className="px-4 py-2">
        {item.provision && (
          <button onClick={onToggle} className="text-xs text-blue-mid hover:underline whitespace-nowrap">
            {expanded ? "▲ Hide" : "▼ See explanation"}
          </button>
        )}
      </td>
    </tr>
    {/* Level 3 - Provision Card */}
    {expanded && item.provision && (
      <tr>
        <td colSpan={6} className="px-4 py-0">
          <ProvisionCardDisplay provision={item.provision} />
        </td>
      </tr>
    )}
  </>
);

const ProvisionCardDisplay = ({ provision: p }: { provision: ProvisionCardType }) => (
  <motion.div
    initial={{ opacity: 0, height: 0 }}
    animate={{ opacity: 1, height: "auto" }}
    exit={{ opacity: 0, height: 0 }}
    className="bg-muted/30 border border-border rounded-lg p-5 my-2 space-y-4"
  >
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <div className="text-xs text-muted-text font-semibold">LINE ITEM</div>
        <div className="text-sm font-semibold text-ink">{p.lineItem}</div>
      </div>
      <div>
        <div className="text-xs text-muted-text font-semibold">SECTION</div>
        <div className="font-mono-num text-sm text-blue-deep">{p.section}</div>
      </div>
    </div>
    <div>
      <div className="text-xs text-muted-text font-semibold mb-1">SOURCE</div>
      <div className="text-sm text-ink-soft">{p.source}</div>
    </div>
    <div>
      <div className="text-xs text-muted-text font-semibold mb-1">THE LAW SAYS</div>
      <div className="font-legal text-sm text-ink-soft leading-relaxed bg-white/60 rounded p-3 border-l-2 border-blue-mid">{p.legalText}</div>
    </div>
    <div>
      <div className="text-xs text-muted-text font-semibold mb-1">HOW IT WAS CALCULATED FOR YOU</div>
      <div className="bg-white/60 rounded p-3 space-y-1">
        {p.calculation.map((step, i) => (
          <div key={i} className="text-sm font-mono-num text-ink-soft">• {step}</div>
        ))}
      </div>
    </div>
    <div>
      <div className="text-xs text-muted-text font-semibold mb-1">IN PLAIN LANGUAGE</div>
      <p className="text-sm text-ink-soft leading-relaxed">{p.plainEnglish}</p>
    </div>
    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
      <div className="bg-blue-pale rounded p-2 text-center">
        <div className="text-xs text-muted-text">OLD REGIME</div>
        <div className="font-mono-num font-semibold text-ink">{p.oldRegimeLabel || formatINR(p.oldRegimeAmount)}</div>
      </div>
      <div className="bg-green-pale rounded p-2 text-center">
        <div className="text-xs text-muted-text">NEW REGIME</div>
        <div className="font-mono-num font-semibold text-ink">{p.newRegimeLabel || formatINR(p.newRegimeAmount)}</div>
      </div>
    </div>
  </motion.div>
);

const DeductionCard = ({ item: d }: { item: DeductionItem }) => (
  <div className="border border-border rounded-lg p-3 mb-2">
    <div className="flex justify-between items-start">
      <div>
        <div className="font-mono-num text-xs text-blue-deep">{d.section}</div>
        <div className="font-semibold text-sm text-ink">{d.name}</div>
      </div>
      <div className="font-mono-num font-semibold text-ink text-sm">{formatINR(d.amount)}</div>
    </div>
    {d.breakdown && (
      <div className="mt-2 space-y-0.5">
        {d.breakdown.map((b, i) => (
          <div key={i} className="flex justify-between text-xs text-muted-text">
            <span>├─ {b.label}</span>
            <span className="font-mono-num">{formatINR(b.amount)}</span>
          </div>
        ))}
      </div>
    )}
    {d.limit && <div className="text-xs text-muted-text mt-1">Limit: {formatINR(d.limit)}/year</div>}
    <p className="text-xs text-muted-text mt-1">{d.plainEnglish}</p>
  </div>
);

const TaxSlabTable = ({ title, subtitle, computation: c, taxableIncome }: {
  title: string; subtitle: string; computation: any; taxableIncome: number;
}) => (
  <div className="bg-white rounded-xl border border-border p-5">
    <h3 className="font-heading font-bold text-ink mb-1">{title}</h3>
    <p className="text-xs text-muted-text mb-3">{subtitle}</p>
    <p className="text-xs text-ink-soft mb-3">How your {formatINR(taxableIncome)} is taxed:</p>
    <table className="w-full text-xs mb-3">
      <thead><tr className="border-b"><th className="text-left py-1 text-muted-text">Range</th><th className="text-right py-1 text-muted-text">Rate</th><th className="text-right py-1 text-muted-text">In Slab</th><th className="text-right py-1 text-muted-text">Tax</th></tr></thead>
      <tbody>
        {c.slabs.map((s: SlabRow, i: number) => (
          <tr key={i} className="border-b border-border/30">
            <td className="py-1">{s.range}</td>
            <td className="py-1 text-right font-mono-num">{s.rate}</td>
            <td className="py-1 text-right font-mono-num">{formatINR(s.incomeInSlab)}</td>
            <td className="py-1 text-right font-mono-num">{formatINR(s.tax)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    {c.specialRateIncomes.length > 0 && (
      <div className="mb-3">
        <div className="text-xs font-semibold text-muted-text mb-1">Special Rate Income:</div>
        {c.specialRateIncomes.map((s: any, i: number) => (
          <div key={i} className="flex justify-between text-xs">
            <span>{s.type} ({s.rate})</span>
            <span className="font-mono-num">{formatINR(s.tax)}</span>
          </div>
        ))}
      </div>
    )}
    <div className="space-y-1 text-xs border-t border-border pt-2">
      <div className="flex justify-between"><span>Tax on Slab Income</span><span className="font-mono-num">{formatINR(c.taxOnSlabIncome)}</span></div>
      <div className="flex justify-between"><span>Tax on Special Rate</span><span className="font-mono-num">{formatINR(c.taxOnSpecialRate)}</span></div>
      <div className="flex justify-between"><span>Surcharge ({c.surchargeRate})</span><span className="font-mono-num">{formatINR(c.surcharge)}</span></div>
      <div className="flex justify-between"><span>Health & Education Cess (4%)</span><span className="font-mono-num">{formatINR(c.cess)}</span></div>
      <div className="flex justify-between font-semibold"><span>Gross Tax Liability</span><span className="font-mono-num">{formatINR(c.grossTaxLiability)}</span></div>
      {c.section87AEligible && <div className="flex justify-between text-green-mid"><span>Section 87A Rebate</span><span className="font-mono-num">({formatINR(c.section87ARebate)})</span></div>}
      <div className="flex justify-between font-semibold"><span>Net Tax Liability</span><span className="font-mono-num">{formatINR(c.netTaxLiability)}</span></div>
      <div className="border-t border-border pt-1 mt-1 space-y-0.5">
        {c.tdsCredits.map((t: any, i: number) => (
          <div key={i} className="flex justify-between text-muted-text"><span>Less: {t.source}</span><span className="font-mono-num">({formatINR(t.amount)})</span></div>
        ))}
        {c.advanceTaxPaid > 0 && <div className="flex justify-between text-muted-text"><span>Less: Advance Tax</span><span className="font-mono-num">({formatINR(c.advanceTaxPaid)})</span></div>}
      </div>
      <div className="flex justify-between font-bold text-ink pt-2 border-t border-border">
        <span>{c.netPayableOrRefund >= 0 ? "NET TAX PAYABLE" : "REFUND"}</span>
        <span className="font-mono-num">{formatINR(c.netPayableOrRefund)}</span>
      </div>
    </div>
  </div>
);

const FlagCard = ({ flag }: { flag: Flag }) => {
  const styles = {
    RED: { bg: "bg-kred-pale", border: "border-kred/30", icon: "🚨", label: "Act Before Filing" },
    GREEN: { bg: "bg-green-pale", border: "border-green-light/30", icon: "💡", label: "Money-Saving Opportunity" },
    AMBER: { bg: "bg-amber-pale", border: "border-amber/30", icon: "⚠️", label: "Verify Before Filing" },
    BLUE: { bg: "bg-blue-pale", border: "border-blue-mid/30", icon: "📋", label: "For Your Information" },
  };
  const s = styles[flag.type];
  return (
    <div className={`${s.bg} border ${s.border} rounded-lg p-4`}>
      <div className="text-xs font-bold text-ink mb-1">{s.icon} {s.label}</div>
      <h4 className="font-semibold text-sm text-ink mb-1">{flag.title}</h4>
      <p className="text-sm text-ink-soft">{flag.description}</p>
    </div>
  );
};

export default Result;
