import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

// ---------------------------------------------------------------------------
// KarSetu.AI landing page. Ported from the design handoff (Claude Design).
// Editorial cream + navy aesthetic, Sora + Instrument Serif + JetBrains Mono,
// single signature green accent, strictly icon-based (no emoji), live regime
// comparator, interactive heads explorer, bridge motif.
// All styles are scoped under #karsetu-landing so nothing leaks to other pages.
// ---------------------------------------------------------------------------

type DeductKey = "80C" | "80D" | "24b" | "std" | "80CCD" | "HRA";

const DEDUCTIONS: { key: DeductKey; section: string; name: string; amount: number; defaultOn: boolean }[] = [
  { key: "80C", section: "§ 80C", name: "Investments", amount: 150000, defaultOn: true },
  { key: "80D", section: "§ 80D", name: "Health ins.", amount: 50000, defaultOn: true },
  { key: "24b", section: "§ 24(b)", name: "Home loan int.", amount: 200000, defaultOn: false },
  { key: "std", section: "§ 16(ia)", name: "Standard ded.", amount: 50000, defaultOn: true },
  { key: "80CCD", section: "§ 80CCD(1B)", name: "NPS extra", amount: 50000, defaultOn: false },
  { key: "HRA", section: "§ 10(13A)", name: "HRA exempt", amount: 180000, defaultOn: false },
];

// Old regime slabs by age (FY25-26 / AY26-27). Each tuple = [width, rate].
type AgeBand = "below_60" | "senior_60_79" | "super_senior_80";
const oldSlabsByAge: Record<AgeBand, [number, number][]> = {
  below_60:        [[250000, 0], [250000, 0.05], [500000, 0.2], [Infinity, 0.3]],
  senior_60_79:    [[300000, 0], [200000, 0.05], [500000, 0.2], [Infinity, 0.3]],
  super_senior_80: [[500000, 0],                 [500000, 0.2], [Infinity, 0.3]],
};
// New regime slabs FY25-26 (Finance Act 2025) — same for all age categories.
const newSlabs: [number, number][] = [
  [400000, 0], [400000, 0.05], [400000, 0.1], [400000, 0.15], [400000, 0.2], [400000, 0.25], [Infinity, 0.3],
];

const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");

function computeSlab(inc: number, slabs: [number, number][]): { tax: number; breakdown: { rate: number; tax: number }[] } {
  let remaining = inc;
  let tax = 0;
  const breakdown: { rate: number; tax: number }[] = [];
  for (const [width, rate] of slabs) {
    const taken = Math.min(remaining, width);
    if (taken <= 0) break;
    const t = taken * rate;
    breakdown.push({ rate, tax: t });
    tax += t;
    remaining -= taken;
    if (remaining <= 0) break;
  }
  return { tax, breakdown };
}

function rebate87A(taxableIncome: number, tax: number, regime: "old" | "new"): number {
  if (regime === "old" && taxableIncome <= 500000) return Math.min(tax, 12500);
  if (regime === "new") {
    if (taxableIncome <= 1200000) return Math.min(tax, 60000);
    // Marginal relief: just above ₹12L, rebate ensures post-tax >= ₹12L.
    const excess = taxableIncome - 1200000;
    if (tax > excess) return Math.max(0, tax - excess);
  }
  return 0;
}

type HeadKey = "salary" | "hp" | "pgbp" | "cg" | "os";

const HEADS: Record<HeadKey, { glyph: string; title: React.ReactNode; sec: string; desc: string; items: { n: string; s: string; v: string }[] }> = {
  salary: {
    glyph: "i-briefcase",
    title: <>Income from <span className="emph">Salaries</span></>,
    sec: "Sections 15, 16, 17 · Rules 2A, 3",
    desc: "Every salary component extracted from Form 16 Part B — Basic, HRA, LTA, perquisites — with each exemption applied per its specific sub-clause. HRA exemption computed using the actual \"least-of-three\" test with your rent, salary, and city-class inputs.",
    items: [
      { n: "Basic Salary", s: "Sec 17(1)", v: "Fully taxable · both regimes" },
      { n: "HRA exemption", s: "Sec 10(13A) · Rule 2A", v: "Old only · least-of-three" },
      { n: "Standard deduction", s: "Sec 16(ia)", v: "₹50k Old · ₹75k New" },
      { n: "Professional tax", s: "Sec 16(iii)", v: "Old only · state-capped" },
      { n: "LTA exemption", s: "Sec 10(5)", v: "Old only · 2-of-4 rule" },
      { n: "Gratuity / leave encashment", s: "Sec 10(10), 10(10AA)", v: "Partial · caps apply" },
    ],
  },
  hp: {
    glyph: "i-home",
    title: <>Income from <span className="emph">House Property</span></>,
    sec: "Sections 22–27 · Rule 4",
    desc: "Annual Value computed for self-occupied, let-out, and deemed let-out properties with the correct GAV/NAV treatment. Interest on borrowed capital allowed within statutory caps, pre-construction interest spread over 5 installments.",
    items: [
      { n: "Self-occupied — GAV", s: "Sec 23(2)", v: "Deemed nil" },
      { n: "Let-out — Annual Value", s: "Sec 23(1)", v: "Higher of expected/actual rent" },
      { n: "Standard deduction (30%)", s: "Sec 24(a)", v: "Automatic on NAV" },
      { n: "Home loan interest", s: "Sec 24(b)", v: "₹2L cap · Old only (self-occ.)" },
      { n: "Pre-construction interest", s: "Sec 24(b) Expl.", v: "5 equal installments" },
      { n: "Loss set-off cap", s: "Sec 71(3A)", v: "₹2L against other heads" },
    ],
  },
  pgbp: {
    glyph: "i-briefcase",
    title: <>Profits & gains from <span className="emph">Business / Profession</span></>,
    sec: "Sections 28–44 · Sec 44AD, 44ADA",
    desc: "Presumptive regimes detected from your bank statements and instructions — Sec 44ADA for eligible professions at 50%, Sec 44AD for small business at 6%/8%. Audit triggers and threshold checks applied automatically.",
    items: [
      { n: "Presumptive — profession", s: "Sec 44ADA", v: "50% of gross receipts" },
      { n: "Presumptive — business", s: "Sec 44AD", v: "6% digital · 8% cash" },
      { n: "Business expenses", s: "Sec 30–37", v: "Rent, salaries, depreciation" },
      { n: "Depreciation", s: "Sec 32", v: "WDV method · block-wise" },
      { n: "Disallowances", s: "Sec 40, 40A", v: "TDS · cash expense caps" },
      { n: "Audit threshold", s: "Sec 44AB", v: "Flagged if crossed" },
    ],
  },
  cg: {
    glyph: "i-trending",
    title: <><span className="emph">Capital</span> Gains</>,
    sec: "Sections 45–55A · 111A · 112A · 54 series",
    desc: "STCG and LTCG computed at correct special rates alongside slab income. Grandfathering for pre-31.01.2018 equity, indexation (where still applicable), Section 54/54F/54EC reinvestment exemptions, and the new ₹1.25L LTCG exemption under Sec 112A all handled.",
    items: [
      { n: "STCG on listed equity", s: "Sec 111A", v: "20% (post 23-Jul-2024) · 15% earlier" },
      { n: "LTCG on listed equity", s: "Sec 112A", v: "12.5% above ₹1.25L" },
      { n: "LTCG on property/gold", s: "Sec 112", v: "12.5% without indexation" },
      { n: "Grandfathering", s: "Sec 55(2)(ac)", v: "FMV 31.01.2018" },
      { n: "Reinvestment — house", s: "Sec 54, 54F", v: "Exemption capped ₹10 cr" },
      { n: "Bonds reinvestment", s: "Sec 54EC", v: "₹50L cap · 5-yr lock" },
    ],
  },
  os: {
    glyph: "i-wallet",
    title: <>Income from <span className="emph">Other Sources</span></>,
    sec: "Sections 56–59",
    desc: "Interest, dividends, gifts, winnings and any residual income. Special-rate taxation applied where relevant — lottery winnings at flat 30%, dividends reconciled against AIS, gift-tax thresholds checked for donor relationship.",
    items: [
      { n: "Savings bank interest", s: "Sec 56 · 80TTA", v: "₹10k deduction (Old)" },
      { n: "FD interest", s: "Sec 56", v: "Fully taxable · slab" },
      { n: "Dividend income", s: "Sec 56(2)(i)", v: "Slab · TDS @10% if >₹5k" },
      { n: "Lottery / winnings", s: "Sec 115BB", v: "Flat 30% · no deductions" },
      { n: "Gifts over ₹50,000", s: "Sec 56(2)(x)", v: "Taxable if non-relative" },
      { n: "Family pension", s: "Sec 57(iia)", v: "1/3 or ₹15k deduction" },
    ],
  },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "Is this a replacement for a tax professional?",
    a: "No — and we're firm about this. KarSetu computes, cites and flags. Because results are AI-generated, they may occasionally miss or misclassify items from your documents. A qualified tax professional interprets edge cases, verifies the numbers, signs your return, and advises on filing strategy. We handle the mechanical work; the judgement calls stay with a human expert.",
  },
  {
    q: "How do you handle my documents? What about privacy?",
    a: "Documents are parsed in-session. No account, no database, no retention. When you close the tab, they're gone. We don't train on your data and we don't share it with anyone.",
  },
  {
    q: "Which assessment year does this support?",
    a: "AY 2026–27 (financial year 2025–26) — computed per Finance Act 2025 slab rates, Section 87A rebate thresholds, Section 112A ₹1.25L exemption, and all CBDT circulars issued before March 2026.",
  },
  {
    q: "What if a document is missing or unclear?",
    a: "We compute with whatever you provide and surface an \"Assumptions & Data Gaps\" panel with the ₹ impact of each gap. For example: if we can't find the FMV on 31.01.2018 for grandfathered LTCG, we'll flag it and show you exactly how to fill the gap.",
  },
  {
    q: "Can you actually file my ITR from here?",
    a: "Not yet. Today we generate a citation-backed draft computation you can hand to a tax professional for review, or use to fill the e-filing portal yourself. Direct filing is on the roadmap but requires a different kind of accountability we're not yet ready to carry.",
  },
  {
    q: "Why is it free?",
    a: "Because tax literacy shouldn't be behind a paywall and the Act is a public document. If the project scales, corporate compliance tools may fund it — but the consumer tool will always be free.",
  },
];

const Index = () => {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [gross, setGross] = useState(1200000);
  const [active, setActive] = useState<Set<DeductKey>>(
    () => new Set(DEDUCTIONS.filter((d) => d.defaultOn).map((d) => d.key)),
  );
  const [head, setHead] = useState<HeadKey>("salary");
  const [ageBand, setAgeBand] = useState<AgeBand>("below_60");
  const [openFaq, setOpenFaq] = useState<Set<number>>(new Set());
  const revealRootRef = useRef<HTMLDivElement | null>(null);

  // Nav scroll state
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Reveal-on-scroll
  useEffect(() => {
    const root = revealRootRef.current;
    if (!root) return;
    const els = root.querySelectorAll<HTMLElement>("[data-reveal]");
    els.forEach((el) => el.classList.add("reveal"));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("vis");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Regime math
  const comp = useMemo(() => {
    const oldDed = DEDUCTIONS.filter((d) => active.has(d.key)).reduce((s, d) => s + d.amount, 0);
    const oldTaxable = Math.max(0, gross - oldDed);
    const newDed = 75000;
    const newTaxable = Math.max(0, gross - newDed);
    const oldSlabs = oldSlabsByAge[ageBand];
    const { tax: oldT, breakdown: oldBr } = computeSlab(oldTaxable, oldSlabs);
    const { tax: newT, breakdown: newBr } = computeSlab(newTaxable, newSlabs);
    const oldAfter = Math.max(0, oldT - rebate87A(oldTaxable, oldT, "old"));
    const newAfter = Math.max(0, newT - rebate87A(newTaxable, newT, "new"));
    const oldFinal = oldAfter * 1.04;
    const newFinal = newAfter * 1.04;
    const oldWins = oldFinal < newFinal;
    const diff = Math.abs(oldFinal - newFinal);
    let reason: string;
    if (!oldWins) {
      reason = oldDed < 350000
        ? "Your deductions aren't large enough to overcome New's lower slab rates."
        : "New's lower rates still win despite your sizeable deductions.";
    } else {
      reason = "Your deductions exceed the break-even — Old's higher slab rates are offset.";
    }
    const maxT = Math.max(oldFinal, newFinal, 1);
    return {
      oldDed, newDed, oldFinal, newFinal, oldBr, newBr, oldWins, diff, reason,
      oldFill: (oldFinal / maxT) * 100,
      newFill: (newFinal / maxT) * 100,
    };
  }, [gross, active, ageBand]);

  const toggleDeduction = (k: DeductKey) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const toggleFaq = (i: number) =>
    setOpenFaq((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const goCompute = () => navigate("/compute");

  const currentHead = HEADS[head];

  return (
    <div id="karsetu-landing" ref={revealRootRef}>
      <style>{CSS}</style>

      {/* SVG icon sprite (no emoji — all pro-grade line icons) */}
      <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <symbol id="i-check" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M5 12.5 10 17.5 19 7.5" /></symbol>
          <symbol id="i-arrow" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" /></symbol>
          <symbol id="i-shield" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /><path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="m9 12 2 2 4-4" /></symbol>
          <symbol id="i-lock" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path fill="none" stroke="currentColor" strokeWidth="1.5" d="M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10" /></symbol>
          <symbol id="i-scale" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" d="M12 3v18M6 7h12M3 13l3-6 3 6M15 13l3-6 3 6M3 13c0 1.7 1.3 3 3 3s3-1.3 3-3M15 13c0 1.7 1.3 3 3 3s3-1.3 3-3" /></symbol>
          <symbol id="i-rupee" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M7 5h10M7 9h10M7 5c3.5 0 5.5 1.8 5.5 4s-2 4-5.5 4h-1l8 7" /></symbol>
          <symbol id="i-book" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" d="M5 4.5h7a3 3 0 0 1 3 3V20a2.5 2.5 0 0 0-2.5-2.5H5V4.5Z" /><path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" d="M19 4.5h-7" /><path fill="none" stroke="currentColor" strokeWidth="1.5" d="M19 4.5V20M5 4.5v13.5" /></symbol>
          <symbol id="i-sparkles" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z" /><path fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" d="M19 14l.9 2.3 2.3.9-2.3.9L19 20.4l-.9-2.3-2.3-.9 2.3-.9L19 14Z" /></symbol>
          <symbol id="i-flag" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M5 3v18M5 4h11l-2 4 2 4H5" /></symbol>
          <symbol id="i-wallet" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" /><path fill="none" stroke="currentColor" strokeWidth="1.5" d="M21 10h-5a2.5 2.5 0 0 0 0 5h5" /></symbol>
          <symbol id="i-briefcase" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" /><path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" /></symbol>
          <symbol id="i-home" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" d="m3 11 9-7 9 7v9a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1v-9Z" /></symbol>
          <symbol id="i-trending" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M3 17 10 10l4 4 7-7M14 6h7v7" /></symbol>
          <symbol id="i-eye" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" /></symbol>
          <symbol id="i-zero" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" /><path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" d="m7 17 10-10" /></symbol>
          <symbol id="i-spark-small" viewBox="0 0 12 12"><path d="M6 0l1.5 4.5L12 6l-4.5 1.5L6 12 4.5 7.5 0 6l4.5-1.5L6 0Z" fill="currentColor" /></symbol>
        </defs>
      </svg>

      {/* ====== NAV ====== */}
      <nav className={`top ${scrolled ? "scrolled" : ""}`}>
        <div className="container inner">
          <a className="brand" href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            <span className="mark">
              <svg viewBox="0 0 26 26" width={26} height={26} fill="none">
                <circle cx="13" cy="13" r="12.5" stroke="#0A1628" />
                <path d="M4 17h18" stroke="#0A1628" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M6 17V11c0-2 2-2 2 0v6M18 17v-6c0-2 2-2 2 0v6" stroke="#0A1628" strokeWidth="1.4" strokeLinecap="round" />
                <circle cx="13" cy="8" r="1.6" fill="var(--ks-accent)" />
              </svg>
            </span>
            <span><span className="kar">Kar</span><span className="setu">Setu</span><span className="dot">.AI</span></span>
          </a>
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#comparator">Old vs New</a>
            <a href="#heads">What we compute</a>
            <a href="#trust">Why trust us</a>
          </div>
          <button className="btn-primary" onClick={goCompute}>
            Compute my taxes
            <span className="arrow"><svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          </button>
        </div>
      </nav>

      {/* ====== HERO ====== */}
      <section className="hero">
        <div className="container">
          <div className="hero-grid">
            <div>
              <div className="hero-badge">
                <span className="seal">ITA</span>
                <span>Strictly per Income Tax Act 1961 · Finance Act 2025</span>
                <span className="dot-live" />
              </div>
              <h1 className="display">
                Your tax,<br />
                <span className="emph">fully</span> computed.<br />
                <span className="accent">Line&nbsp;by&nbsp;cited line.</span>
              </h1>
              <p className="hero-sub">
                Upload your documents, type instructions in plain English, and get a complete Income Tax computation — Old and New regime side-by-side — where <em>every rupee</em> carries the exact section, sub-clause, and plain-English reason it appears.
              </p>
              <div className="hero-cta-row">
                <button className="btn-primary" onClick={goCompute}>
                  Start computing — free
                  <span className="arrow"><svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                </button>
                <a className="btn-ghost" href="#how">See how it works</a>
              </div>
              <div className="hero-ticks">
                <div className="row"><svg className="tick"><use href="#i-check" /></svg> Every figure legally cited — Sections, Rules, Finance Act 2025</div>
                <div className="row"><svg className="tick"><use href="#i-check" /></svg> Old &amp; New Regime compared for the rupee that matters</div>
                <div className="row"><svg className="tick"><use href="#i-check" /></svg> No login, no payment — documents deleted after the session</div>
              </div>
            </div>

            {/* Live computation visual */}
            <div className="viz">
              <div className="doc-stack">
                <div className="doc" style={{ "--r": "-3deg" } as React.CSSProperties}>
                  <div className="dtag"><span>Form 16</span><span className="pill">READ</span></div>
                  <div className="dline l" /><div className="dline m" /><div className="dline s" /><div className="dline l" />
                </div>
                <div className="doc" style={{ "--r": "2deg" } as React.CSSProperties}>
                  <div className="dtag"><span>Bank Stmt</span><span className="pill">READ</span></div>
                  <div className="dline l" /><div className="dline l" /><div className="dline m" /><div className="dline s" />
                </div>
                <div className="doc" style={{ "--r": "-1.5deg" } as React.CSSProperties}>
                  <div className="dtag"><span>Cap. Gains</span><span className="pill">READ</span></div>
                  <div className="dline m" /><div className="dline l" /><div className="dline s" />
                </div>
              </div>

              <div className="bridge"><div className="spark" /></div>

              <div className="ledger">
                <div className="l-head">
                  <div>
                    <div className="l-title">Computation · DRAFT</div>
                    <div className="l-name">R. Kumar <span className="mono" style={{ color: "var(--ks-muted)", fontSize: 11, fontWeight: 400 }}>ABCPK1234F</span></div>
                  </div>
                  <div className="l-ay">Assessment Year<br /><b>2026–27</b></div>
                </div>

                <div className="row"><div><div className="lbl">Salary (Form 16)</div><div className="sec">Sec 17(1) · r/w 10(13A)</div></div><div className="amt">10,86,000</div></div>
                <div className="row"><div><div className="lbl">House property — Self-occupied</div><div className="sec">Sec 24(b) · Home loan interest</div></div><div className="amt neg">−1,30,000</div></div>
                <div className="row"><div><div className="lbl">Freelance (UPI credits)</div><div className="sec">Sec 44ADA · Presumptive @50%</div></div><div className="amt">1,20,000</div></div>
                <div className="row"><div><div className="lbl">Capital Gains — LTCG + STCG</div><div className="sec">Sec 111A · 112A</div></div><div className="amt">45,200</div></div>
                <div className="row"><div><div className="lbl">Deductions — Ch. VI-A</div><div className="sec">80C · 80D · 80TTA</div></div><div className="amt neg">−1,96,200</div></div>

                <div className="total">
                  <div className="lbl">Net taxable income</div>
                  <div className="amt">9,51,200</div>
                </div>

                <div className="verdict">
                  <span className="badge">NEW WINS</span>
                  <span className="txt">by saving you</span>
                  <span className="save">₹ 18,335</span>
                </div>
              </div>

              <div className="citation-tag">Sec&nbsp;24(b)&nbsp;·&nbsp;₹2L&nbsp;cap</div>
            </div>
          </div>
        </div>

        <div className="meta-strip">
          <div className="container">
            <div className="marquee">
              <div className="item"><svg className="g"><use href="#i-book" /></svg>All 5 income heads covered</div>
              <div className="item"><svg className="g"><use href="#i-scale" /></svg>Income Tax Act 1961 · Finance Act 2025</div>
              <div className="item"><svg className="g"><use href="#i-lock" /></svg>Documents deleted after session</div>
              <div className="item"><svg className="g"><use href="#i-zero" /></svg>₹0 — free forever</div>
              <div className="item"><svg className="g"><use href="#i-eye" /></svg>No login required</div>
              <div className="item"><svg className="g"><use href="#i-shield" /></svg>CBDT guidelines followed</div>
            </div>
          </div>
        </div>
      </section>

      {/* ====== HOW ====== */}
      <section className="section" id="how">
        <div className="container">
          <div className="head">
            <h2 className="heading">Three steps.<br /><span className="emph">One bridge</span> from paper<br />to clarity.</h2>
            <p className="right">Named after the Hindi word for bridge — सेतु — KarSetu moves you from messy documents to a citation-backed return in minutes, not evenings. No login. No payment. No dark patterns.</p>
          </div>

          <div className="steps">
            <div className="step" data-reveal>
              <div className="idx">STEP 01 · INGEST</div>
              <div className="glyph">
                <svg width="140" height="120" viewBox="0 0 140 120" fill="none">
                  <rect x="40" y="22" width="64" height="80" rx="4" fill="#fff" stroke="#0A1628" strokeWidth="1.2" transform="rotate(-6 72 62)" />
                  <rect x="36" y="18" width="64" height="80" rx="4" fill="#fff" stroke="#0A1628" strokeWidth="1.2" transform="rotate(3 68 58)" />
                  <rect x="38" y="20" width="64" height="80" rx="4" fill="#fff" stroke="#0A1628" strokeWidth="1.4" />
                  <path d="M46 34h48M46 42h48M46 50h32M46 58h48M46 66h40M46 74h30M46 82h48M46 90h22" stroke="#d8d1c2" strokeWidth="1.4" strokeLinecap="round" />
                  <circle cx="108" cy="24" r="11" fill="var(--ks-accent)" />
                  <path d="m104 24 3 3 5-6" stroke="#0A1628" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </div>
              <h3>Upload <span className="emph">anything</span>.</h3>
              <p>Form 16, bank statements, capital gains reports, LIC/PPF receipts, rent receipts, AIS, home loan certificate. Any mix, any format — PDF, Excel, scanned JPG. We OCR, reconcile and classify.</p>
              <span className="chip"><svg width="10" height="10"><use href="#i-spark-small" /></svg> PDF · XLS · PNG · JPG</span>
            </div>

            <div className="step" data-reveal>
              <div className="idx">STEP 02 · INSTRUCT</div>
              <div className="glyph">
                <svg width="160" height="120" viewBox="0 0 160 120" fill="none">
                  <rect x="20" y="32" width="90" height="52" rx="10" fill="#fff" stroke="#0A1628" strokeWidth="1.4" />
                  <path d="M28 42h62M28 52h50M28 62h54" stroke="#d8d1c2" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M28 72h34" stroke="var(--ks-accent)" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M65 70v8" stroke="#0A1628" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="m24 84 10 14 4-6" fill="#fff" stroke="#0A1628" strokeWidth="1.4" strokeLinejoin="round" />
                  <circle cx="128" cy="40" r="20" fill="#0A1628" />
                  <path d="M120 40h16M120 46h10" stroke="#F6F4EF" strokeWidth="1.4" strokeLinecap="round" />
                  <circle cx="120" cy="34" r="1.6" fill="#F6F4EF" />
                  <circle cx="128" cy="34" r="1.6" fill="#F6F4EF" />
                  <circle cx="136" cy="34" r="1.6" fill="#F6F4EF" />
                </svg>
              </div>
              <h3>Speak <span className="emph">plainly</span>.</h3>
              <p>"Treat UPI credits as freelancing income." "My parents are senior citizens." "I live in Pune, paying ₹35k rent." Any context your CA would ask — just type it. The assistant translates plain English into legal positions.</p>
              <span className="chip"><svg width="10" height="10"><use href="#i-spark-small" /></svg> Plain-English prompts</span>
            </div>

            <div className="step" data-reveal>
              <div className="idx">STEP 03 · INFER</div>
              <div className="glyph">
                <svg width="160" height="120" viewBox="0 0 160 120" fill="none">
                  <rect x="25" y="22" width="110" height="80" rx="6" fill="#fff" stroke="#0A1628" strokeWidth="1.4" />
                  <path d="M25 38h110" stroke="#0A1628" strokeWidth="1.2" />
                  <path d="M33 48h48" stroke="#d8d1c2" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M33 58h72" stroke="#d8d1c2" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M33 68h40" stroke="#d8d1c2" strokeWidth="1.4" strokeLinecap="round" />
                  <rect x="95" y="46" width="32" height="14" rx="2" fill="var(--ks-accent)" />
                  <text x="111" y="56" fontFamily="JetBrains Mono" fontSize="8.5" fill="#0A1628" fontWeight="600" textAnchor="middle">§80C</text>
                  <rect x="95" y="66" width="32" height="14" rx="2" fill="#0A1628" />
                  <text x="111" y="76" fontFamily="JetBrains Mono" fontSize="8.5" fill="#F6F4EF" fontWeight="600" textAnchor="middle">§24(b)</text>
                  <path d="M33 86h38" stroke="#0A1628" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="125" cy="88" r="8" fill="#0A1628" />
                  <path d="m121 88 3 3 5-5" stroke="#F6F4EF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </div>
              <h3>A <span className="emph">receipt</span> of reasoning.</h3>
              <p>Both regimes computed to the rupee. Every line carries the Act provision and a plain-English rationale. Assumptions, data gaps, and flags all called out openly — so you can verify, adjust, and file with confidence.</p>
              <span className="chip"><svg width="10" height="10"><use href="#i-spark-small" /></svg> Cited · auditable · exportable</span>
            </div>
          </div>
        </div>
      </section>

      {/* ====== COMPARATOR ====== */}
      <section className="section" id="comparator" style={{ paddingTop: 20 }}>
        <div className="container">
          <div className="comparator">
            <div className="eyebrow">Interactive · Regime comparator</div>
            <h2 className="heading"><span className="emph">Old</span> or <span className="emph">New</span>? Not a vibe.<br />A rupee-accurate answer.</h2>
            <p className="lead">Drag the slider, toggle your deductions. Watch both regimes compute live — with the exact slab rates applied by Finance Act 2025. This is the same engine that runs your full return, just simplified for intuition.</p>

            <div className="comp-grid">
              <div>
                <div className="slider-card">
                  <label htmlFor="ks-gross-slider" className="lbl">Gross total income</label>
                  <div className="val" aria-live="polite">₹ {fmt(gross)}</div>
                  <input
                    id="ks-gross-slider"
                    type="range"
                    min={500000}
                    max={5000000}
                    step={50000}
                    value={gross}
                    onChange={(e) => setGross(+e.target.value)}
                    aria-label="Gross total income in rupees"
                    aria-valuemin={500000}
                    aria-valuemax={5000000}
                    aria-valuenow={gross}
                    aria-valuetext={`₹${fmt(gross)}`}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10, color: "var(--ks-muted-2)", fontFamily: "'JetBrains Mono',monospace" }}>
                    <span>₹5L</span><span>₹50L</span>
                  </div>

                  <div style={{ marginTop: 14 }} role="radiogroup" aria-label="Age band">
                    <div className="lbl" style={{ marginBottom: 6 }}>Age band (affects Old regime)</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {([
                        { k: "below_60" as AgeBand, t: "Below 60" },
                        { k: "senior_60_79" as AgeBand, t: "60–79" },
                        { k: "super_senior_80" as AgeBand, t: "80+" },
                      ]).map((opt) => (
                        <button
                          key={opt.k}
                          type="button"
                          role="radio"
                          aria-checked={ageBand === opt.k}
                          onClick={() => setAgeBand(opt.k)}
                          style={{
                            fontSize: 11,
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: "1px solid var(--ks-border)",
                            background: ageBand === opt.k ? "var(--ks-ink)" : "transparent",
                            color: ageBand === opt.k ? "var(--ks-paper)" : "var(--ks-muted)",
                            fontFamily: "'JetBrains Mono',monospace",
                            cursor: "pointer",
                          }}
                        >{opt.t}</button>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 24 }} className="eyebrow">Old-regime deductions</div>
                <div className="deductions-row">
                  {DEDUCTIONS.map((d) => (
                    <button
                      key={d.key}
                      className={`deduct-tog ${active.has(d.key) ? "on" : ""}`}
                      onClick={() => toggleDeduction(d.key)}
                    >
                      <div className="k">{d.section}</div>
                      <div className="n">{d.name}</div>
                      <div className="a">₹{fmt(d.amount)}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="regimes">
                  <div className={`regime ${comp.oldWins ? "winner" : ""}`}>
                    <span className="crown">Winner</span>
                    <div className="rname">Old Regime</div>
                    <div className="rnum">₹ {fmt(comp.oldFinal)}</div>
                    <div className="rnote">Total tax + 4% cess</div>
                    <div className="bar"><div className="fill" style={{ width: `${comp.oldFill}%` }} /></div>
                    <div className="breakdown">
                      {comp.oldDed > 0 && <div className="ln"><span>Less: deductions</span><span>−₹{fmt(comp.oldDed)}</span></div>}
                      {comp.oldBr.map((b, i) => (
                        <div key={i} className="ln"><span>Slab {i + 1} · {Math.round(b.rate * 100)}%</span><span>₹{fmt(b.tax)}</span></div>
                      ))}
                    </div>
                  </div>
                  <div className={`regime ${!comp.oldWins ? "winner" : ""}`}>
                    <span className="crown">Winner</span>
                    <div className="rname">New Regime</div>
                    <div className="rnum">₹ {fmt(comp.newFinal)}</div>
                    <div className="rnote">Total tax + 4% cess</div>
                    <div className="bar"><div className="fill" style={{ width: `${comp.newFill}%` }} /></div>
                    <div className="breakdown">
                      <div className="ln"><span>Less: deductions</span><span>−₹{fmt(comp.newDed)}</span></div>
                      {comp.newBr.map((b, i) => (
                        <div key={i} className="ln"><span>Slab {i + 1} · {Math.round(b.rate * 100)}%</span><span>₹{fmt(b.tax)}</span></div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="verdict-bar">
                  <svg className="icon"><use href="#i-sparkles" /></svg>
                  <div className="t"><b>{comp.oldWins ? "Old" : "New"}</b> regime saves you more.<br /><span>{comp.reason}</span></div>
                  <div className="sv"><div className="l">You save</div><div className="v">₹ {fmt(comp.diff)}</div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====== HEADS EXPLORER ====== */}
      <section className="section" id="heads" style={{ paddingTop: 40 }}>
        <div className="container">
          <div className="head">
            <h2 className="heading">Five heads of income.<br /><span className="emph">All of them</span>, end-to-end.</h2>
            <p className="right">Unlike calculators that stop at salary, KarSetu handles the full Act — from Sec 15 salaries to Sec 56 other sources, with all special-rate capital gains computed correctly alongside slab income.</p>
          </div>

          <div className="heads">
            <div className="heads-nav">
              {(Object.keys(HEADS) as HeadKey[]).map((k) => (
                <button
                  key={k}
                  className={`ht ${head === k ? "on" : ""}`}
                  onClick={() => setHead(k)}
                >
                  <span className="k">
                    {k === "salary" ? "§ 15–17" : k === "hp" ? "§ 22–27" : k === "pgbp" ? "§ 28–44" : k === "cg" ? "§ 45–55A" : "§ 56–59"}
                  </span>
                  {k === "salary" ? "Salaries" : k === "hp" ? "House Property" : k === "pgbp" ? "Business & Profession" : k === "cg" ? "Capital Gains" : "Other Sources"}
                </button>
              ))}
            </div>

            <div className="heads-panel">
              <div className="head-title">
                <div className="glyph"><svg width="24" height="24"><use href={`#${currentHead.glyph}`} /></svg></div>
                <div>
                  <h3>{currentHead.title}</h3>
                  <div className="sec-tag">{currentHead.sec}</div>
                </div>
              </div>
              <p className="desc">{currentHead.desc}</p>
              <div className="li-grid">
                {currentHead.items.map((i, idx) => (
                  <div className="li" key={idx}>
                    <div className="n">{i.n}</div>
                    <div className="s">{i.s}</div>
                    <div className="v">{i.v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====== STATEMENT ====== */}
      <section className="statement">
        <div className="container">
          <p className="quote">
            Every rupee on your return should be able to <span className="u">answer a single question:</span> <br />
            <span className="serif">"Why are you here?"</span>
          </p>
          <div className="sig">— A principle we actually hold ourselves to</div>
        </div>
      </section>

      {/* ====== TRUST ====== */}
      <section className="section" id="trust" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="head">
            <h2 className="heading">Built with the <span className="emph">posture</span><br />of a careful CA.</h2>
            <p className="right">The Act is complex for a reason — it encodes fairness, edge cases and exceptions built over 60 years. We don't flatten it. We walk you through it.</p>
          </div>

          <div className="trust-grid">
            {[
              { icon: "i-scale", t: "Statute-faithful", d: "Every computation mapped to the correct section, rule and schedule. Finance Act 2025 slab rates applied." },
              { icon: "i-book", t: "Plain-English", d: "For every cited section, a human-readable explanation of why it applies to you — not generic copy." },
              { icon: "i-lock", t: "Session-only data", d: "Your documents are processed in-session and deleted the moment you close the tab. Nothing retained." },
              { icon: "i-flag", t: "Assumptions, flagged", d: "Data gaps and legal positions surfaced with impact in ₹ — never quietly baked into the result." },
              { icon: "i-shield", t: "No advice, just math", d: "We compute. We cite. We flag. A qualified tax professional makes the final call — that's the right model." },
              { icon: "i-trending", t: "Both regimes, always", d: "Old and New computed in parallel to the last rupee, with an honest explanation of what would flip the winner." },
              { icon: "i-wallet", t: "Refund or payable", d: "TDS credits, advance tax and self-assessment tax reconciled. Clear ₹ number at the end of the ledger." },
              { icon: "i-zero", t: "₹0 — free forever", d: "No account, no paywall, no upsell. KarSetu is a public good — built so tax clarity isn't behind a paywall." },
            ].map((c, i) => (
              <div className="trust-cell" key={i}>
                <svg className="g"><use href={`#${c.icon}`} /></svg>
                <h4 className="t">{c.t}</h4>
                <p className="d">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ====== FAQ ====== */}
      <section className="section" id="faq" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="head">
            <h2 className="heading">Questions we get asked <span className="emph">at dinner</span>.</h2>
            <p className="right">If you don't see yours, email <a href="mailto:ask@karsetu.info" style={{ borderBottom: "1px solid var(--ks-ink)" }}>ask@karsetu.info</a> — we respond within a day.</p>
          </div>

          <div className="faq">
            {FAQS.map((f, i) => {
              const isOpen = openFaq.has(i);
              return (
                <div className={`item ${isOpen ? "open" : ""}`} key={i}>
                  <button className="q" onClick={() => toggleFaq(i)}>
                    {f.q}
                    <span className="plus" />
                  </button>
                  <div className="a"><div style={{ padding: "0 0 4px", maxWidth: 800 }}>{f.a}</div></div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ====== CLOSER ====== */}
      <section id="cta" style={{ padding: "40px 0" }}>
        <div className="container">
          <div className="closer">
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ks-muted-2)", marginBottom: 10 }}>
              <svg width="14" height="14" style={{ color: "var(--ks-accent)" }}><use href="#i-sparkles" /></svg>
              <span>Ready when you are</span>
            </div>
            <h2>From messy PDFs to<br />a <span className="emph">cited computation</span> — in minutes.</h2>
            <p>No signup. No card. Upload your first document and you'll have a draft computation before your chai cools.</p>
            <button className="btn-primary" onClick={goCompute}>
              Compute my taxes
              <span className="arrow"><svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
            </button>
            <div className="sub">AY 2026–27 · Finance Act 2025 · Built for Indian taxpayers</div>
          </div>
        </div>
      </section>

      {/* ====== FOOTER ====== */}
      <footer>
        <div className="container">
          <div className="ftop">
            <div className="col">
              <a className="brand" href="#" style={{ fontSize: 19 }} onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                <span className="mark">
                  <svg viewBox="0 0 26 26" width={26} height={26} fill="none">
                    <circle cx="13" cy="13" r="12.5" stroke="#0A1628" />
                    <path d="M4 17h18" stroke="#0A1628" strokeWidth="1.4" strokeLinecap="round" />
                    <path d="M6 17V11c0-2 2-2 2 0v6M18 17v-6c0-2 2-2 2 0v6" stroke="#0A1628" strokeWidth="1.4" strokeLinecap="round" />
                    <circle cx="13" cy="8" r="1.6" fill="var(--ks-accent)" />
                  </svg>
                </span>
                <span><span style={{ color: "var(--ks-ink)" }}>Kar</span><span style={{ color: "var(--ks-accent-deep)" }}>Setu</span><span style={{ color: "var(--ks-ink)" }}>.AI</span></span>
              </a>
              <p className="about">The bridge from your documents to a citation-backed income tax computation for Indian taxpayers.</p>
            </div>
            <div className="col">
              <h4>Product</h4>
              <a href="#how">How it works</a>
              <a href="#comparator">Regime comparator</a>
              <a href="#heads">Income heads</a>
              <a href="#faq">FAQ</a>
            </div>
            <div className="col">
              <h4>Legal</h4>
              <a href="/privacy" onClick={(e) => { e.preventDefault(); navigate("/privacy"); }}>Privacy policy</a>
              <a href="/terms" onClick={(e) => { e.preventDefault(); navigate("/terms"); }}>Terms of use</a>
            </div>
            <div className="col">
              <h4>Contact</h4>
              <a href="mailto:ask@karsetu.info">ask@karsetu.info</a>
              <a href="mailto:ask@karsetu.info?subject=For%20Professionals">For professionals</a>
              <a href="mailto:ask@karsetu.info?subject=For%20Employers">For employers</a>
            </div>
          </div>
          <div className="fbot">
            <p className="disclaimer">
              KarSetu.AI is an AI-driven tool for informational and tax-planning purposes only. Because it uses AI to extract data from uploaded documents and interpret instructions, results may occasionally be incomplete, misclassified, or inaccurate — always review every figure, cross-check against source documents, and verify with a qualified tax professional before filing your Income Tax Return. This is not legal, financial, or professional tax advice. Results are based on Finance Act 2025 and CBDT guidelines current as of April 2026.
            </p>
            <span>© 2026 KarSetu.AI</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

// ===========================================================================
// Scoped CSS — everything lives under #karsetu-landing so nothing leaks.
// ===========================================================================

const CSS = `
#karsetu-landing {
  --ks-ink:#0A1628;
  --ks-ink-2:#132238;
  --ks-ink-3:#1b2c46;
  --ks-paper:#F6F4EF;
  --ks-paper-2:#EDE9E0;
  --ks-rule:#d8d1c2;
  --ks-rule-dark:rgba(255,255,255,.12);
  --ks-muted:#6b7280;
  --ks-muted-2:#9aa3b2;
  --ks-accent: oklch(0.62 0.14 155);
  --ks-accent-soft: oklch(0.94 0.05 155);
  --ks-accent-deep: oklch(0.42 0.10 155);
  --ks-gold: oklch(0.74 0.12 75);
  --ks-red: oklch(0.58 0.18 25);
  background: var(--ks-paper);
  color: var(--ks-ink);
  font-family: 'Sora', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  font-feature-settings: "ss01","cv11";
  min-height: 100vh;
  overflow-x: hidden;
}
#karsetu-landing *,#karsetu-landing *::before,#karsetu-landing *::after{box-sizing:border-box}
#karsetu-landing .serif{font-family:'Instrument Serif',serif;font-style:italic;font-weight:400;letter-spacing:-0.01em}
#karsetu-landing .mono{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums}
#karsetu-landing a{color:inherit;text-decoration:none}
#karsetu-landing button{font-family:inherit;cursor:pointer;border:0;background:none;color:inherit}
#karsetu-landing .container{max-width:1280px;margin:0 auto;padding:0 28px}
#karsetu-landing .rule{height:1px;background:var(--ks-rule);width:100%}

#karsetu-landing .btn-primary{background:var(--ks-ink);color:var(--ks-paper);padding:16px 24px;border-radius:999px;font-weight:500;font-size:15px;display:inline-flex;align-items:center;gap:10px;transition:transform .2s ease, background .2s ease;letter-spacing:-0.01em}
#karsetu-landing .btn-primary:hover{background:#000;transform:translateY(-1px)}
#karsetu-landing .btn-primary .arrow{width:18px;height:18px;border-radius:50%;background:var(--ks-accent);display:inline-flex;align-items:center;justify-content:center;color:#fff;transition:transform .2s}
#karsetu-landing .btn-primary:hover .arrow{transform:translateX(3px)}
#karsetu-landing .btn-ghost{padding:14px 22px;border-radius:999px;font-weight:500;font-size:14px;color:var(--ks-ink);border:1px solid var(--ks-rule);background:transparent}
#karsetu-landing .btn-ghost:hover{background:var(--ks-paper-2)}
#karsetu-landing .eyebrow{font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:var(--ks-muted);font-weight:500}

/* NAV */
#karsetu-landing nav.top{position:fixed;top:0;left:0;right:0;z-index:50;backdrop-filter:blur(16px);background:rgba(246,244,239,0.72);border-bottom:1px solid transparent;transition:border-color .2s,background .2s}
#karsetu-landing nav.top.scrolled{border-color:var(--ks-rule);background:rgba(246,244,239,0.92)}
#karsetu-landing nav.top .inner{display:flex;align-items:center;justify-content:space-between;height:68px}
#karsetu-landing .brand{display:flex;align-items:center;gap:10px;font-weight:600;letter-spacing:-0.02em;font-size:17px}
#karsetu-landing .brand .mark{width:26px;height:26px;position:relative}
#karsetu-landing .brand .kar{color:var(--ks-ink)}
#karsetu-landing .brand .setu{color:var(--ks-accent-deep)}
#karsetu-landing .brand .dot{color:var(--ks-ink)}
#karsetu-landing .nav-links{display:flex;gap:28px;font-size:14px;color:var(--ks-ink-3)}
#karsetu-landing .nav-links a{position:relative;padding:6px 0}
#karsetu-landing .nav-links a:hover{color:var(--ks-ink)}
#karsetu-landing .nav-links a:hover::after{content:"";position:absolute;left:0;right:0;bottom:-2px;height:1px;background:var(--ks-ink)}
@media (max-width:720px){#karsetu-landing .nav-links{display:none}}

/* HERO */
#karsetu-landing section.hero{position:relative;padding:140px 0 80px;overflow:hidden}
#karsetu-landing .hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:60px;align-items:center}
@media (max-width:960px){#karsetu-landing .hero-grid{grid-template-columns:1fr;gap:40px}}
#karsetu-landing .hero-badge{display:inline-flex;align-items:center;gap:10px;padding:6px 14px 6px 6px;border:1px solid var(--ks-rule);background:#fff;border-radius:999px;font-size:12px;color:var(--ks-ink-3)}
#karsetu-landing .hero-badge .dot-live{width:6px;height:6px;background:var(--ks-accent);border-radius:50%;box-shadow:0 0 0 4px color-mix(in oklab,var(--ks-accent) 25%, transparent);animation:ksPulse 2s ease-in-out infinite}
#karsetu-landing .hero-badge .seal{width:22px;height:22px;border-radius:50%;background:var(--ks-ink);color:var(--ks-paper);display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;letter-spacing:0.04em}
@keyframes ksPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.6;transform:scale(.9)}}
#karsetu-landing h1.display{font-family:'Sora',sans-serif;font-weight:300;font-size:clamp(44px,6.6vw,88px);line-height:0.98;letter-spacing:-0.035em;margin:26px 0 18px;color:var(--ks-ink)}
#karsetu-landing h1.display .emph{font-family:'Instrument Serif',serif;font-style:italic;font-weight:400;letter-spacing:-0.015em;color:var(--ks-ink)}
#karsetu-landing h1.display .accent{color:var(--ks-accent-deep)}
#karsetu-landing .hero-sub{font-size:17px;line-height:1.55;color:var(--ks-ink-3);max-width:520px;margin:0 0 32px;font-weight:300}
#karsetu-landing .hero-cta-row{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:36px}
#karsetu-landing .hero-ticks{display:flex;flex-direction:column;gap:10px;font-size:13px;color:var(--ks-muted)}
#karsetu-landing .hero-ticks .row{display:flex;align-items:center;gap:10px}
#karsetu-landing .hero-ticks .tick{width:14px;height:14px;color:var(--ks-accent-deep)}

/* Hero visual */
#karsetu-landing .viz{position:relative;aspect-ratio:4/5;max-height:640px}
#karsetu-landing .viz .doc-stack{position:absolute;left:-10px;top:20px;width:180px;z-index:1}
#karsetu-landing .viz .doc{background:#fff;border:1px solid var(--ks-rule);border-radius:10px;box-shadow:0 8px 24px -12px rgba(10,22,40,0.18);padding:14px;font-size:10px;color:var(--ks-muted);margin-bottom:12px;transform-origin:left center;animation:ksDocFloat 8s ease-in-out infinite}
#karsetu-landing .viz .doc:nth-child(1){animation-delay:0s;transform:rotate(-3deg)}
#karsetu-landing .viz .doc:nth-child(2){animation-delay:.7s;transform:rotate(2deg)}
#karsetu-landing .viz .doc:nth-child(3){animation-delay:1.4s;transform:rotate(-1.5deg)}
@keyframes ksDocFloat{0%,100%{transform:translate(0,0) rotate(var(--r,-3deg))}50%{transform:translate(2px,-6px) rotate(var(--r,-3deg))}}
#karsetu-landing .viz .doc .dline{height:4px;background:var(--ks-paper-2);border-radius:2px;margin:3px 0}
#karsetu-landing .viz .doc .dline.s{width:40%}
#karsetu-landing .viz .doc .dline.m{width:70%}
#karsetu-landing .viz .doc .dline.l{width:100%}
#karsetu-landing .viz .doc .dtag{font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:var(--ks-ink);font-weight:600;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}
#karsetu-landing .viz .doc .dtag .pill{background:var(--ks-accent-soft);color:var(--ks-accent-deep);padding:1px 6px;border-radius:3px;font-size:8px;letter-spacing:0.08em}

#karsetu-landing .viz .bridge{position:absolute;left:140px;top:40%;width:120px;height:2px;background:linear-gradient(90deg,var(--ks-rule) 0%,var(--ks-accent) 50%,var(--ks-rule) 100%);z-index:0}
#karsetu-landing .viz .bridge::before,#karsetu-landing .viz .bridge::after{content:"";position:absolute;top:-3px;width:8px;height:8px;border-radius:50%;background:var(--ks-accent)}
#karsetu-landing .viz .bridge::before{left:-4px}
#karsetu-landing .viz .bridge::after{right:-4px}
#karsetu-landing .viz .bridge .spark{position:absolute;top:-2px;width:6px;height:6px;background:var(--ks-accent);border-radius:50%;animation:ksSparkMove 3s linear infinite;box-shadow:0 0 12px var(--ks-accent)}
@keyframes ksSparkMove{0%{left:0;opacity:0}10%{opacity:1}90%{opacity:1}100%{left:100%;opacity:0}}

#karsetu-landing .viz .ledger{position:absolute;right:0;top:0;width:82%;background:#fff;border-radius:16px;border:1px solid var(--ks-rule);box-shadow:0 40px 80px -30px rgba(10,22,40,0.25), 0 20px 40px -20px rgba(10,22,40,0.15);padding:22px;z-index:2}
#karsetu-landing .viz .ledger .l-head{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;border-bottom:1px solid var(--ks-rule)}
#karsetu-landing .viz .ledger .l-title{font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--ks-muted);margin-bottom:4px}
#karsetu-landing .viz .ledger .l-name{font-size:15px;font-weight:500;letter-spacing:-0.01em}
#karsetu-landing .viz .ledger .l-ay{font-size:10px;color:var(--ks-muted);text-align:right}
#karsetu-landing .viz .ledger .l-ay b{color:var(--ks-ink);font-weight:500;display:block;margin-top:2px;font-size:12px}
#karsetu-landing .viz .ledger .row{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;padding:11px 0;border-bottom:1px dashed var(--ks-rule)}
#karsetu-landing .viz .ledger .row:last-of-type{border:0}
#karsetu-landing .viz .ledger .row .lbl{font-size:12px;color:var(--ks-ink-3)}
#karsetu-landing .viz .ledger .row .sec{font-size:10px;color:var(--ks-muted);margin-top:2px;letter-spacing:0.02em;font-family:'JetBrains Mono',monospace}
#karsetu-landing .viz .ledger .row .amt{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:500;color:var(--ks-ink)}
#karsetu-landing .viz .ledger .row .amt.neg{color:var(--ks-accent-deep)}
#karsetu-landing .viz .ledger .total{margin-top:14px;padding-top:14px;border-top:2px solid var(--ks-ink);display:flex;justify-content:space-between;align-items:center}
#karsetu-landing .viz .ledger .total .lbl{font-size:12px;color:var(--ks-ink)}
#karsetu-landing .viz .ledger .total .amt{font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:600;letter-spacing:-0.01em}
#karsetu-landing .viz .ledger .verdict{margin-top:14px;padding:12px;background:var(--ks-ink);color:var(--ks-paper);border-radius:10px;display:flex;align-items:center;gap:12px}
#karsetu-landing .viz .ledger .verdict .badge{background:var(--ks-accent);color:var(--ks-ink);font-weight:600;font-size:11px;padding:3px 8px;border-radius:4px;letter-spacing:0.04em}
#karsetu-landing .viz .ledger .verdict .txt{font-size:12px;color:var(--ks-muted-2)}
#karsetu-landing .viz .ledger .verdict .save{margin-left:auto;font-family:'JetBrains Mono',monospace;font-weight:600;color:#fff}

#karsetu-landing .citation-tag{position:absolute;right:-20px;top:160px;background:var(--ks-ink);color:var(--ks-paper);padding:8px 12px;border-radius:8px;font-size:11px;font-family:'JetBrains Mono',monospace;box-shadow:0 10px 30px -10px rgba(10,22,40,.4);animation:ksTagFloat 4s ease-in-out infinite;z-index:3}
#karsetu-landing .citation-tag::before{content:"";position:absolute;left:-6px;top:50%;transform:translateY(-50%);border:6px solid transparent;border-right-color:var(--ks-ink)}
@keyframes ksTagFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}

/* META STRIP */
#karsetu-landing .meta-strip{border-top:1px solid var(--ks-rule);border-bottom:1px solid var(--ks-rule);padding:20px 0;margin-top:40px;background:var(--ks-paper-2)}
#karsetu-landing .meta-strip .marquee{display:flex;align-items:center;gap:48px;overflow:hidden;justify-content:space-between;flex-wrap:wrap}
#karsetu-landing .meta-strip .item{display:inline-flex;align-items:center;gap:10px;font-size:12px;color:var(--ks-ink-3);white-space:nowrap;letter-spacing:-0.005em}
#karsetu-landing .meta-strip .item .g{width:16px;height:16px;color:var(--ks-accent-deep);flex-shrink:0}

/* SECTION */
#karsetu-landing .section{padding:120px 0}
#karsetu-landing .section .head{display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:end;margin-bottom:70px}
@media (max-width:820px){#karsetu-landing .section .head{grid-template-columns:1fr;gap:20px}}
#karsetu-landing h2.heading{font-family:'Sora',sans-serif;font-weight:300;font-size:clamp(40px,4.8vw,64px);line-height:1;letter-spacing:-0.03em;margin:0}
#karsetu-landing h2.heading .emph{font-family:'Instrument Serif',serif;font-style:italic;font-weight:400}
#karsetu-landing .section .head .right{font-size:16px;line-height:1.55;color:var(--ks-ink-3);font-weight:300;max-width:460px}

#karsetu-landing .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-top:1px solid var(--ks-ink);border-bottom:1px solid var(--ks-ink)}
@media (max-width:820px){#karsetu-landing .steps{grid-template-columns:1fr}}
#karsetu-landing .step{padding:40px 32px;border-right:1px solid var(--ks-rule);position:relative;cursor:pointer;transition:background .25s ease}
#karsetu-landing .step:last-child{border-right:0}
@media (max-width:820px){#karsetu-landing .step{border-right:0;border-bottom:1px solid var(--ks-rule)}#karsetu-landing .step:last-child{border-bottom:0}}
#karsetu-landing .step:hover{background:#fff}
#karsetu-landing .step .idx{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ks-muted);letter-spacing:0.1em}
#karsetu-landing .step .glyph{height:120px;margin:28px 0;display:flex;align-items:center;justify-content:center;position:relative}
#karsetu-landing .step h3{font-family:'Sora',sans-serif;font-weight:500;font-size:22px;letter-spacing:-0.02em;margin:0 0 14px;line-height:1.25;min-height:2.5em}
#karsetu-landing .step h3 .emph{font-family:'Instrument Serif',serif;font-style:italic;font-weight:400}
#karsetu-landing .step p{font-size:14px;line-height:1.6;color:var(--ks-ink-3);margin:0;font-weight:300}
#karsetu-landing .step .chip{margin-top:16px;display:inline-flex;align-items:center;gap:6px;font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--ks-muted);padding:4px 8px;border:1px solid var(--ks-rule);border-radius:4px}

/* COMPARATOR */
#karsetu-landing .comparator{background:var(--ks-ink);color:var(--ks-paper);border-radius:28px;padding:64px;position:relative;overflow:hidden}
@media (max-width:820px){#karsetu-landing .comparator{padding:36px;border-radius:20px}}
#karsetu-landing .comparator::before{content:"";position:absolute;inset:0;background:radial-gradient(600px 400px at 15% 10%, color-mix(in oklab, var(--ks-accent) 12%, transparent), transparent 70%), radial-gradient(500px 500px at 90% 100%, color-mix(in oklab, var(--ks-accent) 10%, transparent), transparent 70%);pointer-events:none}
#karsetu-landing .comparator > *{position:relative}
#karsetu-landing .comparator .eyebrow{color:var(--ks-muted-2)}
#karsetu-landing .comparator h2{margin:12px 0 10px;color:var(--ks-paper)}
#karsetu-landing .comparator .lead{color:var(--ks-muted-2);max-width:560px;font-size:16px;font-weight:300;line-height:1.55}
#karsetu-landing .comp-grid{display:grid;grid-template-columns:2fr 3fr;gap:48px;margin-top:48px}
@media (max-width:900px){#karsetu-landing .comp-grid{grid-template-columns:1fr}}
#karsetu-landing .slider-card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:28px}
#karsetu-landing .slider-card .lbl{font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:var(--ks-muted-2);margin-bottom:10px}
#karsetu-landing .slider-card .val{font-family:'JetBrains Mono',monospace;font-size:34px;font-weight:500;letter-spacing:-0.02em}
#karsetu-landing .slider-card input[type=range]{width:100%;margin-top:14px;-webkit-appearance:none;appearance:none;height:4px;background:rgba(255,255,255,0.15);border-radius:2px;outline:none}
#karsetu-landing .slider-card input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;background:var(--ks-accent);border-radius:50%;cursor:pointer;border:3px solid var(--ks-ink);box-shadow:0 0 0 1px var(--ks-accent)}
#karsetu-landing .slider-card input[type=range]::-moz-range-thumb{width:20px;height:20px;background:var(--ks-accent);border-radius:50%;cursor:pointer;border:3px solid var(--ks-ink)}
#karsetu-landing .deductions-row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:28px}
#karsetu-landing .deduct-tog{padding:14px;border:1px solid rgba(255,255,255,0.1);border-radius:10px;background:rgba(255,255,255,0.02);cursor:pointer;text-align:left;transition:all .2s ease;color:var(--ks-paper)}
#karsetu-landing .deduct-tog:hover{border-color:rgba(255,255,255,0.22)}
#karsetu-landing .deduct-tog.on{background:color-mix(in oklab,var(--ks-accent) 18%, transparent);border-color:var(--ks-accent)}
#karsetu-landing .deduct-tog .k{font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--ks-muted-2)}
#karsetu-landing .deduct-tog .n{font-size:13px;margin-top:3px}
#karsetu-landing .deduct-tog .a{font-size:11px;margin-top:4px;color:var(--ks-muted-2);font-family:'JetBrains Mono',monospace}
#karsetu-landing .deduct-tog.on .a{color:var(--ks-accent)}

#karsetu-landing .regimes{display:grid;grid-template-columns:1fr 1fr;gap:18px}
#karsetu-landing .regime{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:26px;transition:all .3s ease;position:relative}
#karsetu-landing .regime.winner{background:color-mix(in oklab,var(--ks-accent) 12%, transparent);border-color:var(--ks-accent)}
#karsetu-landing .regime .crown{position:absolute;top:-11px;right:20px;background:var(--ks-accent);color:var(--ks-ink);font-size:10px;font-weight:600;padding:4px 10px;border-radius:999px;letter-spacing:0.06em;opacity:0;transition:opacity .3s}
#karsetu-landing .regime.winner .crown{opacity:1}
#karsetu-landing .regime .rname{font-size:13px;color:var(--ks-muted-2);letter-spacing:0.08em;text-transform:uppercase}
#karsetu-landing .regime .rnum{font-family:'JetBrains Mono',monospace;font-size:32px;font-weight:500;letter-spacing:-0.02em;margin:10px 0 2px}
#karsetu-landing .regime.winner .rnum{color:var(--ks-accent)}
#karsetu-landing .regime .rnote{font-size:11px;color:var(--ks-muted-2);font-family:'JetBrains Mono',monospace}
#karsetu-landing .regime .bar{height:6px;background:rgba(255,255,255,0.08);border-radius:3px;margin-top:18px;overflow:hidden}
#karsetu-landing .regime .bar .fill{height:100%;background:var(--ks-muted-2);transition:width .6s cubic-bezier(.2,.8,.2,1)}
#karsetu-landing .regime.winner .bar .fill{background:var(--ks-accent)}
#karsetu-landing .regime .breakdown{margin-top:16px;font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--ks-muted-2)}
#karsetu-landing .regime .breakdown .ln{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed rgba(255,255,255,0.08)}
#karsetu-landing .regime .breakdown .ln:last-child{border:0}

#karsetu-landing .verdict-bar{margin-top:28px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:18px 20px;display:flex;align-items:center;gap:18px}
#karsetu-landing .verdict-bar .icon{width:38px;height:38px;flex-shrink:0;color:var(--ks-accent)}
#karsetu-landing .verdict-bar .t{font-size:13px;color:var(--ks-muted-2);font-weight:300}
#karsetu-landing .verdict-bar .t b{color:var(--ks-paper);font-weight:500}
#karsetu-landing .verdict-bar .sv{margin-left:auto;text-align:right}
#karsetu-landing .verdict-bar .sv .l{font-size:10px;color:var(--ks-muted-2);letter-spacing:0.1em;text-transform:uppercase}
#karsetu-landing .verdict-bar .sv .v{font-family:'JetBrains Mono',monospace;font-size:22px;color:var(--ks-accent);font-weight:500}

/* HEADS EXPLORER */
#karsetu-landing .heads{display:grid;grid-template-columns:280px 1fr;gap:48px;margin-top:60px}
@media (max-width:900px){#karsetu-landing .heads{grid-template-columns:1fr}}
#karsetu-landing .heads-nav{display:flex;flex-direction:column;gap:2px;border-left:1px solid var(--ks-rule)}
#karsetu-landing .heads-nav .ht{padding:18px 20px;font-size:14px;color:var(--ks-muted);cursor:pointer;border-left:2px solid transparent;margin-left:-1px;transition:all .2s;font-weight:400;position:relative;letter-spacing:-0.01em;text-align:left}
#karsetu-landing .heads-nav .ht:hover{color:var(--ks-ink)}
#karsetu-landing .heads-nav .ht.on{color:var(--ks-ink);border-left-color:var(--ks-ink);background:linear-gradient(90deg,rgba(0,0,0,0.02) 0%,transparent 100%)}
#karsetu-landing .heads-nav .ht .k{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ks-muted-2);display:block;margin-bottom:3px;letter-spacing:0.06em}
#karsetu-landing .heads-nav .ht.on .k{color:var(--ks-accent-deep)}
#karsetu-landing .heads-panel{background:#fff;border:1px solid var(--ks-rule);border-radius:20px;padding:36px;min-height:460px;position:relative}
#karsetu-landing .heads-panel .head-title{display:flex;align-items:flex-start;gap:16px;margin-bottom:10px}
#karsetu-landing .heads-panel .head-title .glyph{width:48px;height:48px;flex-shrink:0;border:1px solid var(--ks-rule);border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--ks-ink)}
#karsetu-landing .heads-panel h3{font-family:'Sora',sans-serif;font-weight:400;font-size:28px;letter-spacing:-0.02em;margin:0 0 4px;line-height:1.05}
#karsetu-landing .heads-panel h3 .emph{font-family:'Instrument Serif',serif;font-style:italic}
#karsetu-landing .heads-panel .sec-tag{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ks-muted)}
#karsetu-landing .heads-panel .desc{font-size:14px;color:var(--ks-ink-3);margin:18px 0 24px;line-height:1.6;font-weight:300;max-width:640px}
#karsetu-landing .heads-panel .li-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:0;border-top:1px solid var(--ks-rule);border-bottom:1px solid var(--ks-rule)}
@media (max-width:700px){#karsetu-landing .heads-panel .li-grid{grid-template-columns:1fr}}
#karsetu-landing .heads-panel .li{padding:16px 18px;border-bottom:1px dashed var(--ks-rule);border-right:1px dashed var(--ks-rule)}
#karsetu-landing .heads-panel .li:nth-child(2n){border-right:0}
#karsetu-landing .heads-panel .li .n{font-size:13px;color:var(--ks-ink);font-weight:500}
#karsetu-landing .heads-panel .li .s{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ks-muted);margin-top:3px}
#karsetu-landing .heads-panel .li .v{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--ks-accent-deep);margin-top:6px;font-weight:500}

/* STATEMENT */
#karsetu-landing .statement{padding:140px 0 120px;text-align:center}
#karsetu-landing .statement .quote{font-family:'Instrument Serif',serif;font-style:italic;font-size:clamp(32px,4vw,56px);line-height:1.15;letter-spacing:-0.02em;color:var(--ks-ink);max-width:1000px;margin:0 auto}
#karsetu-landing .statement .quote .u{background:linear-gradient(0deg, color-mix(in oklab,var(--ks-accent) 30%, transparent) 30%, transparent 30%)}
#karsetu-landing .statement .sig{margin-top:40px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:var(--ks-muted)}

/* TRUST */
#karsetu-landing .trust-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid var(--ks-ink);border-radius:16px;overflow:hidden;background:#fff}
@media (max-width:820px){#karsetu-landing .trust-grid{grid-template-columns:repeat(2,1fr)}}
#karsetu-landing .trust-cell{padding:32px 26px;border-right:1px solid var(--ks-rule);border-bottom:1px solid var(--ks-rule)}
#karsetu-landing .trust-cell:nth-child(4n){border-right:0}
#karsetu-landing .trust-cell:nth-last-child(-n+4){border-bottom:0}
@media (max-width:820px){#karsetu-landing .trust-cell{border-right:0;border-bottom:1px solid var(--ks-rule) !important}#karsetu-landing .trust-cell:nth-child(2n){border-right:0}#karsetu-landing .trust-cell:nth-last-child(-n+2){border-bottom:0 !important}}
#karsetu-landing .trust-cell .g{width:28px;height:28px;color:var(--ks-ink);margin-bottom:16px}
#karsetu-landing .trust-cell .t{font-size:14px;font-weight:500;letter-spacing:-0.01em;margin:0 0 6px}
#karsetu-landing .trust-cell .d{font-size:12px;color:var(--ks-muted);line-height:1.5;font-weight:300}

/* FAQ */
#karsetu-landing .faq{border-top:1px solid var(--ks-rule);border-bottom:1px solid var(--ks-rule)}
#karsetu-landing .faq .item{border-bottom:1px solid var(--ks-rule);padding:0}
#karsetu-landing .faq .item:last-child{border-bottom:0}
#karsetu-landing .faq .q{display:flex;align-items:center;justify-content:space-between;padding:26px 0;cursor:pointer;width:100%;font-size:18px;font-weight:400;letter-spacing:-0.015em;text-align:left;color:var(--ks-ink)}
#karsetu-landing .faq .q .plus{width:24px;height:24px;position:relative;flex-shrink:0;margin-left:20px}
#karsetu-landing .faq .q .plus::before,#karsetu-landing .faq .q .plus::after{content:"";position:absolute;background:var(--ks-ink);top:50%;left:50%;transform:translate(-50%,-50%)}
#karsetu-landing .faq .q .plus::before{width:12px;height:1.5px}
#karsetu-landing .faq .q .plus::after{width:1.5px;height:12px;transition:transform .25s}
#karsetu-landing .faq .item.open .q .plus::after{transform:translate(-50%,-50%) rotate(90deg);opacity:0}
#karsetu-landing .faq .a{max-height:0;overflow:hidden;transition:max-height .35s ease;font-size:15px;line-height:1.7;color:var(--ks-ink-3);font-weight:300}
#karsetu-landing .faq .item.open .a{max-height:260px;padding-bottom:26px}

/* CLOSER */
#karsetu-landing .closer{position:relative;border-radius:28px;overflow:hidden;background:var(--ks-ink);color:var(--ks-paper);padding:80px 64px;margin-bottom:80px}
@media (max-width:820px){#karsetu-landing .closer{padding:48px 32px}}
#karsetu-landing .closer::before{content:"";position:absolute;inset:0;background:radial-gradient(800px 500px at 80% 100%, color-mix(in oklab,var(--ks-accent) 22%, transparent), transparent 60%)}
#karsetu-landing .closer > *{position:relative}
#karsetu-landing .closer h2{font-family:'Sora',sans-serif;font-weight:300;font-size:clamp(40px,5vw,72px);line-height:1;letter-spacing:-0.03em;margin:0 0 20px;color:var(--ks-paper)}
#karsetu-landing .closer h2 .emph{font-family:'Instrument Serif',serif;font-style:italic}
#karsetu-landing .closer p{font-size:17px;line-height:1.55;color:var(--ks-muted-2);max-width:560px;margin:0 0 32px;font-weight:300}
#karsetu-landing .closer .btn-primary{background:var(--ks-accent);color:var(--ks-ink);font-weight:500}
#karsetu-landing .closer .btn-primary .arrow{background:var(--ks-ink);color:var(--ks-paper)}
#karsetu-landing .closer .btn-primary:hover{background:color-mix(in oklab,var(--ks-accent) 85%, white)}
#karsetu-landing .closer .sub{margin-top:28px;font-size:12px;color:var(--ks-muted-2);letter-spacing:0.04em}

/* FOOTER */
#karsetu-landing footer{padding:60px 0 40px;border-top:1px solid var(--ks-rule)}
#karsetu-landing footer .ftop{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px;margin-bottom:60px}
@media (max-width:820px){#karsetu-landing footer .ftop{grid-template-columns:1fr 1fr}}
#karsetu-landing footer .col h4{font-family:'Sora',sans-serif;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:var(--ks-muted);font-weight:500;margin:0 0 16px}
#karsetu-landing footer .col a{display:block;font-size:14px;color:var(--ks-ink-3);padding:6px 0}
#karsetu-landing footer .col a:hover{color:var(--ks-ink)}
#karsetu-landing footer .about{font-size:14px;color:var(--ks-ink-3);line-height:1.6;max-width:360px;font-weight:300;margin-top:12px}
#karsetu-landing footer .fbot{border-top:1px solid var(--ks-rule);padding-top:24px;display:flex;justify-content:space-between;align-items:flex-start;gap:24px;font-size:12px;color:var(--ks-muted);flex-wrap:wrap}
#karsetu-landing footer .disclaimer{max-width:600px;line-height:1.6}

/* Reveal-on-scroll */
#karsetu-landing .reveal{opacity:0;transform:translateY(24px);transition:opacity .8s ease, transform .8s cubic-bezier(.2,.8,.2,1)}
#karsetu-landing .reveal.vis{opacity:1;transform:none}
`;

export default Index;
