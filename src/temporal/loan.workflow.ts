// autoLoan — the child entity. Runs for the full term, sleeps between due
// dates, accepts payments, and ends only when the balance hits zero or the
// car it belongs to is totaled. Composed alongside the car, by ID.
import {
  setHandler,
  condition,
  defineQuery,
  defineSignal,
  sleep,
  log,
} from "@temporalio/workflow";
import { scaledDays } from "./shared";
import type { LifelineEvent, LoanInput, LoanState } from "./types";

export const getLoan = defineQuery<LoanState>("getLoan");
export const makePayment = defineSignal<[{ amount: number }]>("makePayment");
export const settleLoan = defineSignal<[{ reason: string }]>("settleLoan");

function amortizedPayment(principal: number, apr: number, n: number): number {
  const r = apr / 12;
  if (r === 0) return Math.round(principal / n);
  return Math.round((principal * r) / (1 - Math.pow(1 + r, -n)));
}

export async function autoLoan(input: LoanInput): Promise<void> {
  const monthly = amortizedPayment(input.principal, input.apr, input.termMonths);
  const log0: LifelineEvent = {
    atMs: Date.now(),
    kind: "LoanOpened",
    detail: `$${input.principal} @ ${(input.apr * 100).toFixed(1)}% over ${input.termMonths}mo`,
  };
  const state: LoanState = {
    loanId: `loan-${input.vin}`,
    vin: input.vin,
    status: "active",
    principal: input.principal,
    balance: input.principal,
    apr: input.apr,
    termMonths: input.termMonths,
    paymentsMade: 0,
    monthlyPayment: monthly,
    lifeline: [log0],
  };

  let paidThisPeriod = false;
  const isOpen = () => state.status === "active" || state.status === "delinquent";

  setHandler(getLoan, () => state);

  setHandler(makePayment, ({ amount }) => {
    state.balance = Math.max(0, state.balance - amount);
    state.paymentsMade += 1;
    paidThisPeriod = true;
    state.lifeline.push({
      atMs: Date.now(),
      kind: "PaymentMade",
      detail: `Paid $${amount}, balance $${state.balance}`,
    });
    if (state.balance <= 0) {
      state.status = "paid_off";
      state.lifeline.push({ atMs: Date.now(), kind: "PaidOff", detail: "Loan paid in full" });
    } else {
      state.status = "active";
    }
  });

  setHandler(settleLoan, ({ reason }) => {
    state.status = "settled";
    state.lifeline.push({ atMs: Date.now(), kind: "Settled", detail: reason });
  });

  log.info("Loan opened", { loanId: state.loanId });

  for (let month = 0; month < input.termMonths; month++) {
    if (!isOpen()) break;
    await sleep(scaledDays(30));
    if (!isOpen()) break;

    if (!paidThisPeriod) {
      state.status = "delinquent";
      state.lifeline.push({
        atMs: Date.now(),
        kind: "PaymentMissed",
        detail: `Missed payment, balance $${state.balance}`,
      });
    }
    paidThisPeriod = false;
  }

  // Let a late payoff land before the entity closes.
  await condition(() => state.balance <= 0 || state.status === "settled", scaledDays(1));
}
