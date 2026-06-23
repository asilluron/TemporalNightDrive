import { NextResponse } from "next/server";
import { existsSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Chaos toggle for the resilience beat: while the flag file exists, the
// sendRecallNotice activity fails and the audience watches Temporal retry.
const FLAG = join(process.cwd(), ".mail-broken");

export async function GET() {
  return NextResponse.json({ broken: existsSync(FLAG) });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const broken = Boolean(body.broken);
  if (broken) {
    writeFileSync(FLAG, "down");
  } else if (existsSync(FLAG)) {
    rmSync(FLAG);
  }
  return NextResponse.json({ broken });
}
