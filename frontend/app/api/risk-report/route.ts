import { NextResponse } from "next/server";
import { getRiskReport } from "@/lib/backend";

export async function GET() {
  try {
    const payload = await getRiskReport();
    return NextResponse.json(payload, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Cannot load risk report" }, { status: 502 });
  }
}
