// Domain model shared across Worker, Workflows, and the Next.js server layer.
// No Temporal SDK imports here so it is safe to pull into any runtime.

export type VehicleStatus =
  | "manufactured"
  | "in_transit"
  | "on_lot"
  | "sold"
  | "recalled"
  | "traded_in"
  | "scrapped";

export interface VehicleProfile {
  vin: string;
  make: string;
  model: string;
  year: number;
}

export interface Recall {
  id: string;
  reason: string;
  issuedAtMs: number;
  noticeSent: boolean;
}

export interface ServiceRecord {
  date: string;
  mileage: number;
  work: string;
  cost: number;
}

// A single entry in the car's auto-generated lifeline / history report.
export interface LifelineEvent {
  atMs: number;
  kind: string;
  detail: string;
}

export interface VehicleState {
  vin: string;
  make: string;
  model: string;
  year: number;
  status: VehicleStatus;
  odometer: number;
  price?: number;
  listedAtMs?: number;
  lotLocation?: string;
  currentOwner?: string;
  openRecalls: Recall[];
  serviceRecords: ServiceRecord[];
  financeWorkflowId?: string;
  lifeline: LifelineEvent[];
  bornAtMs: number;
}

export interface SaleInput {
  buyer: string;
  salePrice: number;
  financed: boolean;
}

export interface SaleResult {
  vin: string;
  buyer: string;
  salePrice: number;
  loanWorkflowId?: string;
  soldAtMs: number;
}

// --- autoLoan child entity --------------------------------------------------
export type LoanStatus = "active" | "delinquent" | "paid_off" | "settled";

export interface LoanInput {
  vin: string;
  principal: number;
  apr: number;
  termMonths: number;
}

export interface LoanState {
  loanId: string;
  vin: string;
  status: LoanStatus;
  principal: number;
  balance: number;
  apr: number;
  termMonths: number;
  paymentsMade: number;
  monthlyPayment: number;
  lifeline: LifelineEvent[];
}
