// Activities are the side-effecting edges of the system. They can fail, retry,
// and be changed freely without breaking Workflow determinism.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { VehicleProfile, VehicleState } from "./shared";

// Toggled by the chaos panel: while this flag file exists, the mail service is
// "down" and sendRecallNotice fails — letting the audience watch Temporal retry.
const MAIL_BROKEN_FLAG = join(process.cwd(), ".mail-broken");

const MAKES_MODELS: Array<[string, string]> = [
  ["Honda", "Civic"],
  ["Toyota", "Corolla"],
  ["Ford", "Mustang"],
  ["Tesla", "Model 3"],
  ["DeLorean", "DMC-12"],
  ["Pontiac", "Firebird"],
];

// Stamp a freshly manufactured vehicle: pick a make/model/year for this VIN.
// In a real system this would call out to an MES or VIN registry.
export async function stampVehicle(vin: string): Promise<VehicleProfile> {
  const [make, model] =
    MAKES_MODELS[Math.floor(Math.random() * MAKES_MODELS.length)];
  const year = 2019 + Math.floor(Math.random() * 8);
  return { vin, make, model, year };
}

// Pretend to compute a fair market price for a vehicle landing on the lot.
export async function fetchMarketValue(profile: VehicleProfile): Promise<number> {
  const base = 18000 + (profile.year - 2019) * 1500;
  const jitter = Math.floor(Math.random() * 4000);
  return base + jitter;
}

// Convenience read model. The DB is optional — a projection, not the source of
// truth. Here we just log; swap in a Supabase/Postgres upsert when desired.
export async function projectToReadModel(state: VehicleState): Promise<void> {
  console.log(`[read-model] ${state.vin} -> ${state.status} ($${state.price ?? "-"})`);
}

// The failure-and-retry beat. Throws while the mail service is "broken" so the
// audience can watch the activity retry and then succeed once it is healed.
export async function sendRecallNotice(owner: string, reason: string): Promise<void> {
  if (existsSync(MAIL_BROKEN_FLAG)) {
    throw new Error("Mail service unavailable");
  }
  console.log(`[mail] recall notice to ${owner}: ${reason}`);
}
