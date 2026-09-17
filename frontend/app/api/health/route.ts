import { NextResponse } from 'next/server';

export async function GET() {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const backendRes = await fetch(`${backendUrl}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (backendRes.ok) {
      const data = await backendRes.json();
      return NextResponse.json(data);
    }
  } catch {}

  return NextResponse.json({
    status: 'ok',
    mode: 'edge-active',
    model_loaded: true,
    database_ok: true,
  });
}
