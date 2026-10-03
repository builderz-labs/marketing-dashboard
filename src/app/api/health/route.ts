import { NextResponse } from 'next/server';

// Health probes must always execute — never serve a build-time cached response.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true });
}
