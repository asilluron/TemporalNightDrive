import { NextResponse } from "next/server";
import { getTemporalClient } from "@/lib/temporal/client";
import { TASK_QUEUE, randomVin, workflowIdForVin } from "@/temporal/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manufacture a new vehicle: start one vehicleLifecycle Workflow whose ID is
// the VIN. We reference the Workflow by name so this route never imports the
// Workflow sandbox code.
export async function POST() {
  try {
    const client = await getTemporalClient();
    const vin = randomVin();

    await client.workflow.start("vehicleLifecycle", {
      taskQueue: TASK_QUEUE,
      workflowId: workflowIdForVin(vin),
      args: [{ vin }],
    });

    return NextResponse.json({ vin });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { error: `Could not reach Temporal: ${message}` },
      { status: 502 },
    );
  }
}
