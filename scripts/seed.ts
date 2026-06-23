// Seed a varied lot so the dashboard opens with a living population instead of
// an empty floor. Talks to Temporal exactly like the Next.js API layer does:
// it starts vehicleLifecycle entities by VIN, then drives them with the same
// Signals and the requestSale Update the UI uses.
import { Client, Connection } from "@temporalio/client";
import { TASK_QUEUE, randomVin } from "../src/temporal/shared";
import type { SaleInput, SaleResult, VehicleState } from "../src/temporal/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LOTS = ["A12", "B07", "C23", "D41", "E09"];
const BUYERS = ["Marty McFly", "Kavinsky", "The Midnight", "Doc Brown"];
const rand = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

type Seed = { make: string; model: string; year: number };

async function manufacture(client: Client, vin: string, seed?: Seed): Promise<void> {
  try {
    await client.workflow.start("vehicleLifecycle", {
      taskQueue: TASK_QUEUE,
      workflowId: vin,
      args: [{ vin, seed }],
    });
    console.log(`  manufactured ${vin}${seed ? ` (${seed.make} ${seed.model})` : ""}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`  skip ${vin} — ${message}`);
  }
}

async function waitOnLot(client: Client, vin: string): Promise<VehicleState | null> {
  const handle = client.workflow.getHandle(vin);
  for (let i = 0; i < 30; i++) {
    try {
      const snap = await handle.query<VehicleState>("getSnapshot");
      if (snap.status === "on_lot") return snap;
    } catch {
      /* handlers not registered yet — retry */
    }
    await sleep(200);
  }
  return null;
}

async function arrive(client: Client, vin: string, location: string): Promise<void> {
  await client.workflow.getHandle(vin).signal("arriveOnLot", { location });
}

async function sell(client: Client, vin: string, financed: boolean): Promise<void> {
  const snap = await waitOnLot(client, vin);
  if (!snap) return;
  const input: SaleInput = { buyer: rand(BUYERS), salePrice: snap.price ?? 20000, financed };
  try {
    const res = await client.workflow
      .getHandle(vin)
      .executeUpdate<SaleResult, [SaleInput]>("requestSale", { args: [input] });
    console.log(`  sold ${vin} -> ${res.buyer}${financed ? " (financed)" : ""}`);
  } catch (err) {
    console.log(`  sale rejected for ${vin}: ${err instanceof Error ? err.message : err}`);
  }
}

async function main(): Promise<void> {
  const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
  const namespace = process.env.TEMPORAL_NAMESPACE ?? "default";
  const connection = await Connection.connect({ address });
  const client = new Client({ connection, namespace });

  console.log(`[seed] connected to ${address} (${namespace})`);

  // The hero car — a known DeLorean the recall panel targets by default.
  const hero = "DELOREANDMC121981";
  await manufacture(client, hero, { make: "DeLorean", model: "DMC-12", year: 1981 });

  // A varied fleet with random make/model/year from the stamping activity.
  const fleet = Array.from({ length: 6 }, () => randomVin());
  for (const vin of fleet) await manufacture(client, vin);

  // Give the freshly started entities a moment to register their handlers.
  await sleep(750);

  // Put the hero and the whole fleet on the lot.
  await arrive(client, hero, "A12");
  for (const vin of fleet) await arrive(client, vin, rand(LOTS));

  // Drive a few through later life stages so the lot looks lived-in.
  await sell(client, fleet[1], true); // financed -> spawns the autoLoan child
  await sell(client, fleet[2], false); // cash sale
  await client.workflow.getHandle(fleet[3]).signal("issueRecall", { reason: "Airbag inflator" });
  await client.workflow.getHandle(fleet[4]).signal("scrap", { reason: "Flood damage" });

  console.log("[seed] done — open http://localhost:3000 to watch the lot.");
  await connection.close();
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
