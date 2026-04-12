// ===== Assessee Setup =====
export type TaxpayerType = 'INDIVIDUAL' | 'HUF';
export type AssessmentYear = 'AY 2026-27' | 'AY 2025-26' | 'AY 2024-25' | 'AY 2023-24';
export type ResidencyStatus = 'RESIDENT_OR' | 'RNOR' | 'NON_RESIDENT';
export type AgeCategory = 'BELOW_60' | 'SENIOR_60_79' | 'SUPER_SENIOR_80';

export interface AssesseeSetup {
  type: TaxpayerType;
  assessmentYear: AssessmentYear;
  residencyStatus: ResidencyStatus;
  ageCategory: AgeCategory;
}

// ===== Document Upload =====
export type DocumentSlotType =
  | 'FORM_16' | 'AIS_TIS' | 'BANK_STATEMENT' | 'CAPITAL_GAINS'
  | 'PAY_SLIPS' | 'HOME_EDUCATION_LOAN' | 'FD_SAVINGS_INTEREST'
  | 'INSURANCE_PREMIUM' | 'DONATION_RECEIPTS' | 'PROPERTY_SALE'
  | 'PREVIOUS_ITR' | 'OTHER_DOCUMENTS';

export interface UploadedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  slotType: DocumentSlotType;
  password?: string;
}

export interface DocumentSlot {
  type: DocumentSlotType;
  name: string;
  icon: string;
  description: string;
  badge: 'Recommended' | 'Strongly Recommended' | 'Optional';
  accepts: string[];
  note?: string;
  infoBox?: string;
  files: UploadedFile[];
}

// ===== Parsed Document =====
export interface ParsedDocument {
  originalName: string;
  classifiedType: string;
  extractedText: string;
  keyDataFound: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  parsingNotes: string[];
}

// ===== Processing Log =====
export type LogStatus = 'working' | 'done' | 'warning' | 'error';

export interface LogEntry {
  id: string;
  status: LogStatus;
  message: string;
}

// ===== Tax Computation Result =====
export interface ProvisionCard {
  lineItem: string;
  section: string;
  source: string;
  legalText: string;
  calculation: string[];
  plainEnglish: string;
  oldRegimeAmount: number;
  newRegimeAmount: number;
  oldRegimeLabel?: string;
  newRegimeLabel?: string;
}

export interface LineItem {
  name: string;
  source: string;
  section: string;
  oldRegimeAmount: number;
  newRegimeAmount: number;
  provision?: ProvisionCard;
}

export type IncomeHeadType = 'SALARY' | 'HOUSE_PROPERTY' | 'PGBP' | 'CAPITAL_GAINS' | 'OTHER_SOURCES';

export interface IncomeHead {
  type: IncomeHeadType;
  name: string;
  sectionRef: string;
  oldRegimeTotal: number;
  newRegimeTotal: number;
  lineItems: LineItem[];
  subSections?: {
    title: string;
    description: string;
    lineItems: LineItem[];
  }[];
}

export type AssumptionCategory = 'DATA_GAP' | 'INSTRUCTION_DERIVED' | 'LEGAL_POSITION';

export interface Assumption {
  category: AssumptionCategory;
  item: string;
  description: string;
  impact: string;
  howToFix?: string;
}

export interface DeductionItem {
  section: string;
  name: string;
  amount: number;
  limit?: number;
  breakdown?: { label: string; amount: number }[];
  law: string;
  plainEnglish: string;
}

export interface SlabRow {
  range: string;
  rate: string;
  incomeInSlab: number;
  tax: number;
}

export interface SpecialRateIncome {
  type: string;
  amount: number;
  rate: string;
  tax: number;
  section: string;
}

export interface TaxComputation {
  slabs: SlabRow[];
  specialRateIncomes: SpecialRateIncome[];
  taxOnSlabIncome: number;
  taxOnSpecialRate: number;
  totalTaxBeforeSurcharge: number;
  surcharge: number;
  surchargeRate: string;
  cess: number;
  grossTaxLiability: number;
  section87ARebate: number;
  section87AEligible: boolean;
  netTaxLiability: number;
  tdsCredits: { source: string; amount: number }[];
  advanceTaxPaid: number;
  netPayableOrRefund: number;
}

export type FlagType = 'RED' | 'GREEN' | 'AMBER' | 'BLUE';

export interface Flag {
  type: FlagType;
  title: string;
  description: string;
}

export interface TDSReconciliationRow {
  source: string;
  tdsInDoc: number;
  tdsInAIS: number | null;
  match: boolean | null;
}

export interface CarryForwardLoss {
  type: string;
  amount: number;
  rule: string;
  section: string;
}

export interface UnclassifiedCredit {
  date: string;
  description: string;
  amount: number;
}

export interface DocumentStatus {
  name: string;
  status: 'extracted' | 'partial' | 'not_uploaded';
  note: string;
}

export interface AgriculturalIncome {
  amount: number;
  explanation: string;
  partialIntegrationSteps: string[];
}

export interface RegimeDecision {
  winner: 'OLD' | 'NEW';
  savings: number;
  reasons: string[];
  whatWouldFlip: string[];
  isCloseCall: boolean;
}

export interface TaxResult {
  assesseeDetails: {
    name: string;
    pan: string;
    assessmentYear: AssessmentYear;
    governingLaw: string;
    residency: string;
    ageCategory: string;
    aiConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
    confidenceExplanation: string;
    documentStatuses: DocumentStatus[];
  };
  assumptions: Assumption[];
  agriculturalIncome?: AgriculturalIncome;
  incomeHeads: IncomeHead[];
  grossTotalIncome: { oldRegime: number; newRegime: number };
  deductions: {
    oldRegime: DeductionItem[];
    newRegime: DeductionItem[];
    totalOld: number;
    totalNew: number;
    lostInNewRegime: number;
  };
  taxableIncome: { oldRegime: number; newRegime: number };
  taxComputation: {
    oldRegime: TaxComputation;
    newRegime: TaxComputation;
  };
  regimeDecision: RegimeDecision;
  carryForwardLosses: CarryForwardLoss[];
  flags: Flag[];
  tdsReconciliation: TDSReconciliationRow[];
  unclassifiedCredits: UnclassifiedCredit[];
  advanceTaxNote?: {
    netPayable: number;
    installments: { date: string; percentage: string }[];
  };
  section87AContestedNote?: string;
}

// ===== Compute Flow State =====
export interface ComputeState {
  step: 1 | 2 | 3 | 4;
  assesseeSetup: Partial<AssesseeSetup>;
  documentSlots: DocumentSlot[];
  instructions: string;
  sessionId: string;
  logEntries: LogEntry[];
  progress: number;
  isProcessing: boolean;
  error: string | null;
  result: TaxResult | null;
}
