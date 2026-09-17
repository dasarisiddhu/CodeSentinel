import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // Proxy to real backend if available
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const backendRes = await fetch(`${backendUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (backendRes.ok) {
      const data = await backendRes.json();
      return NextResponse.json(data);
    }
  } catch {
    // Backend offline / Vercel edge mode
  }

  // Fallback demo review ID
  return NextResponse.json({
    review_id: 'demo-review-001',
  });
}
