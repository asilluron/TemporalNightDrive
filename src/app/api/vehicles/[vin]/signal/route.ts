import { NextResponse } from "next/server";
import { getTemporalClient } from "@/lib/temporal/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "arriveOnLot",
  "recordTestDrive",
  "logService",
  "issueRecall",
  "reportAccident",
  "tradeIn",
  "scrap",
]);

// Send a fire-and-forget command to a living vehicle entity.
// Body: { "signal": "arriveOnLot", "args": [{ "location": "A12" }] }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ vin: string }> },
) {
  const { vin } = await params;
  const body = await req.json().catch(() => ({}));
  const signal: string = body.signal;
  const args: unknown[] = Array.isArray(body.args) ? body.args : [];

  if (!ALLOWED.has(signal)) {
    return NextResponse.json(
      { error: `Unknown signal: ${signal}` },
      { status: 400 },
    );
  }

  try {
    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(vin);
    await handle.signal(signal, ...args);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
