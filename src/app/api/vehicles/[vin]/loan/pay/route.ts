import { NextResponse } from "next/server";
import { getTemporalClient } from "@/lib/temporal/client";
import { loanIdForVin } from "@/temporal/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Send a makePayment signal to the child autoLoan entity.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ vin: string }> },
) {
  const { vin } = await params;
  const body = await req.json().catch(() => ({}));
  const amount = Number(body.amount ?? 0);
  try {
    const client = await getTemporalClient();
    await client.workflow.getHandle(loanIdForVin(vin)).signal("makePayment", { amount });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "no loan";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
