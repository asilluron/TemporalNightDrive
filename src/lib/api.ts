// Thin browser-side fetch helpers for the dashboard.
import type { LoanState, SaleInput, SaleResult, VehicleState } from "@/temporal/types";

export interface LotStats {
  living: number;
  simulatedYears: number;
  timeScale: number;
}

export interface LotResponse {
  vehicles: VehicleState[];
  stats: LotStats | null;
  error?: string;
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export async function fetchLot(): Promise<LotResponse> {
  return json(await fetch("/api/lot", { cache: "no-store" }));
}

export async function manufacture(): Promise<{ vin?: string; error?: string }> {
  return json(await fetch("/api/vehicles/spawn", { method: "POST" }));
}

export async function fetchLoan(vin: string): Promise<LoanState | null> {
  const res = await fetch(`/api/vehicles/${vin}/loan`, { cache: "no-store" });
  return res.ok ? json<LoanState>(res) : null;
}

export async function sendSignal(
  vin: string,
  signal: string,
  args: unknown[] = [],
): Promise<void> {
  await fetch(`/api/vehicles/${vin}/signal`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ signal, args }),
  });
}

export async function requestSale(
  vin: string,
  input: SaleInput,
): Promise<{ result?: SaleResult; error?: string }> {
  const res = await fetch(`/api/vehicles/${vin}/sale`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.ok
    ? { result: await json<SaleResult>(res) }
    : { error: (await json<{ error: string }>(res)).error };
}

export async function makeLoanPayment(loanId: string, amount: number): Promise<void> {
  // The loan workflow id is loan-<vin>; signal it directly via the vin route helper.
  await fetch(`/api/vehicles/${loanId.replace(/^loan-/, "")}/loan/pay`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount }),
  });
}

export async function fireRecall(
  make: string,
  model: string,
  year: number | undefined,
  reason: string,
): Promise<{ recalled?: number; error?: string }> {
  return json(
    await fetch("/api/recall", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ make, model, year, reason }),
    }),
  );
}

export async function getMailBroken(): Promise<boolean> {
  return (await json<{ broken: boolean }>(await fetch("/api/chaos/mail"))).broken;
}

export async function setMailBroken(broken: boolean): Promise<boolean> {
  return (
    await json<{ broken: boolean }>(
      await fetch("/api/chaos/mail", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ broken }),
      }),
    )
  ).broken;
}
