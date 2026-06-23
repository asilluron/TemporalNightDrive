// Replay test for the vehicleLifecycle entity. The promise Temporal makes is
// that a Workflow can be re-executed against its recorded history and reach the
// exact same decisions — that is what lets a worker crash and resume. Here we:
//   1. run a real lifecycle (signals + the requestSale Update + scrap),
//   2. fetch the resulting event history,
//   3. replay that history through the current Workflow code and assert it
//      does not raise a non-determinism error.
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import * as activities from "../src/temporal/activities";
import { SA } from "../src/temporal/search-attributes";
import type { SaleInput, SaleResult, VehicleState } from "../src/temporal/types";

const TASK_QUEUE = "replay-test";
const WORKFLOWS = require.resolve("../src/temporal/workflows");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function driveLifecycle(env: TestWorkflowEnvironment): Promise<string> {
  const vin = "REPLAYTESTVIN0001";
  const handle = await env.client.workflow.start("vehicleLifecycle", {
    taskQueue: TASK_QUEUE,
    workflowId: vin,
    args: [{ vin, seed: { make: "DeLorean", model: "DMC-12", year: 1981 } }],
  });

  await handle.signal("arriveOnLot", { location: "A12" });

  // Wait for the arrival to land before the Update's validator runs.
  for (let i = 0; i < 50; i++) {
    const snap = await handle.query<VehicleState>("getSnapshot");
    if (snap.status === "on_lot") break;
    await sleep(50);
  }

  const sale: SaleInput = { buyer: "Marty McFly", salePrice: 21000, financed: false };
  const result = await handle.executeUpdate<SaleResult, [SaleInput]>("requestSale", {
    args: [sale],
  });
  if (result.buyer !== sale.buyer) throw new Error("Update returned unexpected result");

  await handle.signal("scrap", { reason: "End of test" });
  await handle.result(); // terminal — the entity closes
  return vin;
}

async function main(): Promise<void> {
  console.log("[replay] starting local Temporal test server (first run downloads the CLI)…");
  const env = await TestWorkflowEnvironment.createLocal({
    server: { searchAttributes: Object.values(SA) },
  });

  try {
    const worker = await Worker.create({
      connection: env.nativeConnection,
      namespace: env.namespace ?? "default",
      taskQueue: TASK_QUEUE,
      workflowsPath: WORKFLOWS,
      activities,
    });

    const vin = await worker.runUntil(driveLifecycle(env));
    console.log(`[replay] lifecycle complete for ${vin}, fetching history…`);

    const history = await env.client.workflow.getHandle(vin).fetchHistory();
    console.log(`[replay] history has ${history.events?.length ?? 0} events; replaying…`);

    await Worker.runReplayHistory({ workflowsPath: WORKFLOWS }, history);
    console.log("[replay] PASS — vehicleLifecycle replayed with no non-determinism.");
  } finally {
    await env.teardown();
  }
}

main().catch((err) => {
  console.error("[replay] FAIL —", err);
  process.exit(1);
});
