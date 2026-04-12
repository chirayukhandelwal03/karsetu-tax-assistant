

# KarSetu.AI — Complete Build Plan

## Overview
**KarSetu.AI** — "Bridge to Tax Clarity" — is a premium Indian income tax computation tool. Users upload documents, provide instructions, and get a fully explained, legally cited tax computation under both Old and New Regime, powered by Claude AI.

No login required. No permanent storage. Free forever.

---

## Phase 1: Design System & Foundation

### 1.1 — Custom Color Palette & Typography
- Replace the default shadcn theme with the spec's exact color system: ink (#0A0F1A), blue family (#0D3B6E → #E3F0FF), green family (#0A4A2F → #E2F7EE), amber/red warnings, neutral backgrounds (#F7F9FC)
- Load **Sora** (headings/body), **JetBrains Mono** (rupee amounts, section refs), **Lora italic** (legal quotations) from Google Fonts
- Create utility classes: `font-mono-num` for amounts, `font-legal` for law text

### 1.2 — Shared Layout Components
- **Navbar**: Sticky, "Kar**Setu**.AI" logo (Setu in green), single CTA button, mobile hamburger
- **Footer**: Logo, tagline, Privacy/Terms links, mandatory disclaimer
- **DisclaimerBanner**: Amber warning banner used on result page

---

## Phase 2: Landing Page (/)

- **Hero section**: Full-viewport dark gradient background (140deg, #060C18 → #0D3B6E → #083528), blurred glow circles, pill badge "🇮🇳 Strictly per Income Tax Act 1961 · Finance Act 2025", two-line headline (white + green), subtext, large green CTA, three trust pills, floating document animations, scroll indicator
- **How It Works**: 3-card section (Upload → Instruct → Compute) with icons, stacking on mobile
- **Trust Strip**: Horizontal scrolling strip with 6 trust items
- **Footer** with disclaimer

---

## Phase 3: Compute Page (/compute) — 4-Step Flow

All steps managed via React state with a progress bar showing steps 1–4.

### Step 1 — Assessee Setup
- Taxpayer type (4 cards, 2 active + 2 "coming soon" greyed out)
- Assessment Year dropdown (AY 2026-27 to 2023-24) with ⓘ tooltip explaining AY concept
- Residency status (3 radio options with descriptions)
- Age category (3 radio options showing exemption limits)
- "Continue →" disabled until all filled

### Step 2 — Document Upload
- 12 named upload slots in responsive grid (3→2→1 columns)
- Each slot: icon, name, extraction description, Recommended/Optional badge, drag-and-drop zone
- Multi-file per slot, file validation (PDF/Excel/image, 10MB per file, 50MB total)
- Password-protected PDF prompt with auto-try hints
- Upload summary at bottom: "[N] documents · [X] MB"

### Step 3 — Instructions
- Large textarea (max 5000 chars) with placeholder examples
- 8 clickable suggestion chips that append text
- Character counter
- "Compute My Taxes →" green CTA triggers processing

### Step 4 — Processing (Live Log)
- Dark terminal-style card with animated log lines (✅ ⏳ ⚠️ ❌ icons)
- Progress bar 0→100%
- Lines appear one-by-one with delays based on streaming response
- On completion: "Your computation is ready! →" button → navigates to /result
- Error state with retry option

---

## Phase 4: Result Page (/result) — The Heart of the App

All 15 sections from the spec, in order:

### 4.1 — Disclaimer Banner (amber, top)
### 4.2 — Sticky Summary Bar (regime comparison, tax amounts, winner badge, PDF/CA buttons)
### 4.3 — Assessee Details Card (name, masked PAN, AY, residency, age, AI confidence, document statuses)
### 4.4 — Assumptions Panel (collapsible, 3 card types: Data Gap amber, Instruction-Derived blue, Legal Position purple)
### 4.5 — Agricultural Income Block (conditional, green border, partial integration explanation)

### 4.6 — Income Computation: 5-Head Accordion (THE CORE)
**3-level expandable structure:**
- **Level 1** (collapsed): Head name + Old/New regime totals
- **Level 2** (expanded): Table of all line items with Source, Section, amounts per regime
- **Level 3** (per line item "See explanation"): **Provision Card** with:
  - Source document reference
  - Section reference in JetBrains Mono
  - Legal text in Lora italic
  - Step-by-step calculation with arithmetic
  - Plain English explanation
  - Old vs New regime comparison

All 5 heads built:
1. **Salaries** (Sec 15-17): Basic, HRA exemption calc, LTA, allowances, standard deduction, professional tax
2. **House Property** (Sec 22-27): Per-property GAV→NAV→deductions→net, self-occupied vs let-out
3. **PGBP** (Sec 28-44): Presumptive (44AD/44ADA), speculative (intraday), non-speculative (F&O)
4. **Capital Gains** (Sec 45-55A): STCG 111A @20%, LTCG 112A @12.5% with ₹1.25L exemption + grandfathering, property, VDA @30%, gold, SGB
5. **Other Sources** (Sec 56-59): Interest, dividends, gifts, lottery

### 4.7 — Gross Total Income Row (both regimes)
### 4.8 — Deductions Panel (Chapter VI-A, two-column Old vs New, with explanation box)
### 4.9 — Taxable Income Row
### 4.10 — Tax Computation Tables (both regimes side-by-side: slab tables, special rate income, surcharge, cess, Section 87A rebate with contested position note, TDS credits, net payable/refund)
### 4.11 — Regime Decision Panel (winner badge, savings amount, reasons, what would flip it)
### 4.12 — Carry-Forward Losses Section (conditional)
### 4.13 — Flags & Recommendations (RED/GREEN/AMBER/BLUE colored cards)
### 4.14 — TDS Reconciliation Table
### 4.15 — Unclassified Credits Note (friendly tone, amber background)
### 4.16 — Advance Tax Note (conditional, if >₹10,000 payable)
### 4.17 — Final Disclaimer + 4 Action Buttons (Download PDF, Download Excel, Consult CA modal, Compute Again)

---

## Phase 5: Supabase Edge Functions

### 5.1 — `parse-documents`
- Receives files as base64
- PDF text extraction, image OCR via Claude, Excel/CSV parsing
- Document classification using keyword matching (Form 16, AIS, bank statements, etc.)
- Returns structured extracted content with confidence scores

### 5.2 — `compute-tax`
- Receives assessee setup + parsed documents + user instructions
- Calls Anthropic Claude API (claude-opus-4-5) with the complete system prompt from Section 10
- **Streaming response** back to frontend for live log updates
- ANTHROPIC_API_KEY stored as Supabase secret (never in frontend)
- Returns the full JSON structure with all computation data

---

## Phase 6: Supporting Pages & Features

### 6.1 — Privacy Policy (/privacy) — Full content per Section 11
### 6.2 — Terms of Use (/terms) — Full content per Section 11
### 6.3 — CA Connect Modal — Form with name, mobile, city, email, note → saves to Supabase `ca_requests` table
### 6.4 — Session Management — UUID in sessionStorage, computation result stored temporarily in Supabase (24hr TTL)
### 6.5 — PDF Download — via window.print() with print-optimized styles
### 6.6 — Mobile Responsive — All breakpoints per Section 13 (regime toggle tabs on mobile, scrollable tables, compact sticky bar, large tap targets)

---

## Phase 7: Error Handling
- All error scenarios from Section 12: file too large, unsupported type, password-protected PDF, API timeout/error, no documents + no instructions, corrupted file, large computation warning

---

## Dependencies to Install
- `framer-motion` (animations)
- Google Fonts: Sora, JetBrains Mono, Lora (via index.html link)

## Supabase Setup Required
- Edge functions: `parse-documents`, `compute-tax`
- Secret: `ANTHROPIC_API_KEY`
- Table: `ca_requests` (name, mobile, city, email, note, session_id, created_at)
- Optional: `sessions` table for temporary result storage with 24hr TTL

