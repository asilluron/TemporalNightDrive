import { NextResponse } from "next/server";
import { getTemporalClient } from "@/lib/temporal/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A recall is a population action, not a per-car action. One Visibility query
// finds every living matching car and we fan a signal out to each — nobody
// maintained a list of which cars needed it.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const make: string = body.make;
  const model: string = body.model;
  const year: number | undefined = body.year ? Number(body.year) : undefined;
  const reason: string = body.reason ?? "Safety recall";

  if (!make || !model) {
    return NextResponse.json({ error: "make and model are required" }, { status: 400 });
  }

  let query =
    `WorkflowType = 'vehicleLifecycle' AND Status != 'scrapped'` +
    ` AND Make = '${make}' AND Model = '${model}'`;
  if (year) query += ` AND VehicleYear = ${year}`;

  try {
    const client = await getTemporalClient();
    let count = 0;
    for await (const wf of client.workflow.list({ query })) {
      await client.workflow.getHandle(wf.workflowId).signal("issueRecall", { reason });
      count += 1;
    }
    return NextResponse.json({ recalled: count, reason });
  } catch (err) {
    const message = err instanceof Error ? err.message : "recall failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
