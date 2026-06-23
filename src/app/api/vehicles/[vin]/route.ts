import { NextResponse } from "next/server";
import { getTemporalClient } from "@/lib/temporal/client";
import type { VehicleState } from "@/temporal/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read a vehicle's live state straight out of the running entity's memory.
// This is a Query, not a database read.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ vin: string }> },
) {
  const { vin } = await params;
  try {
    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(vin);
    const snapshot = await handle.query<VehicleState>("getSnapshot");
    return NextResponse.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
