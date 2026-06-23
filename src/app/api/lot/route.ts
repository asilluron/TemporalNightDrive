import { NextResponse } from "next/server";
import { getTemporalClient } from "@/lib/temporal/client";
import { DEMO_TIME_SCALE, type VehicleState } from "@/temporal/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// The lot is a Visibility *query* over the population of running entities,
// not a SELECT over a table. We list living vehicleLifecycle programs and ask
// each one for its current snapshot.
export async function GET() {
  try {
    const client = await getTemporalClient();
    const query = "WorkflowType = 'vehicleLifecycle' AND ExecutionStatus = 'Running'";

    const ids: string[] = [];
    for await (const wf of client.workflow.list({ query })) {
      ids.push(wf.workflowId);
    }

    const vehicles: VehicleState[] = [];
    await Promise.all(
      ids.map(async (id) => {
        try {
          const snap = await client.workflow.getHandle(id).query<VehicleState>("getSnapshot");
          vehicles.push(snap);
        } catch {
          /* mid continue-as-new / not queryable yet — skip this tick */
        }
      }),
    );

    vehicles.sort((a, b) => a.bornAtMs - b.bornAtMs);

    const now = Date.now();
    const simulatedYears = vehicles.reduce(
      (sum, v) => sum + ((now - v.bornAtMs) * DEMO_TIME_SCALE) / YEAR_MS,
      0,
    );

    return NextResponse.json({
      vehicles,
      stats: {
        living: vehicles.length,
        simulatedYears: Math.round(simulatedYears),
        timeScale: DEMO_TIME_SCALE,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "lot unavailable";
    return NextResponse.json({ error: message, vehicles: [], stats: null }, { status: 502 });
  }
}
