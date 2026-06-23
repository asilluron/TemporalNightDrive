import { NextResponse } from "next/server";
import { getTemporalClient } from "@/lib/temporal/client";
import { loanIdForVin, type LoanState } from "@/temporal/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read the child autoLoan entity's live state, if this car was financed.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ vin: string }> },
) {
  const { vin } = await params;
  try {
    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(loanIdForVin(vin));
    const loan = await handle.query<LoanState>("getLoan");
    return NextResponse.json(loan);
  } catch {
    return NextResponse.json({ error: "no loan" }, { status: 404 });
  }
}
