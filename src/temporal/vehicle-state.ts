// Pure, deterministic helpers for the vehicle entity. No SDK / no clock access
// (callers pass `nowMs`) so this is safe to unit test and to import anywhere.
import type { LifelineEvent, VehicleProfile, VehicleState } from "./types";

export function createInitialState(
  profile: VehicleProfile,
  nowMs: number,
): VehicleState {
  return {
    vin: profile.vin,
    make: profile.make,
    model: profile.model,
    year: profile.year,
    status: "manufactured",
    odometer: 0,
    openRecalls: [],
    serviceRecords: [],
    lifeline: [{ atMs: nowMs, kind: "Manufactured", detail: "Rolled off the line" }],
    bornAtMs: nowMs,
  };
}

export function isScrapped(state: VehicleState): boolean {
  return state.status === "scrapped";
}

export function pushEvent(
  state: VehicleState,
  nowMs: number,
  kind: string,
  detail: string,
): void {
  state.lifeline.push({ atMs: nowMs, kind, detail });
}

// Trim history before rolling forward via continue-as-new so the entity stays
// cheap to run no matter how long it has lived.
export function compact(state: VehicleState): VehicleState {
  return {
    ...state,
    lifeline: state.lifeline.slice(-25),
    serviceRecords: state.serviceRecords.slice(-25),
  };
}

export interface HistoryReport {
  vin: string;
  vehicle: string;
  status: string;
  owners: number;
  events: LifelineEvent[];
}

export function buildHistoryReport(state: VehicleState): HistoryReport {
  const owners = state.lifeline.filter((e) => e.kind === "Sold").length;
  return {
    vin: state.vin,
    vehicle: `${state.year} ${state.make} ${state.model}`,
    status: state.status,
    owners,
    events: state.lifeline,
  };
}
