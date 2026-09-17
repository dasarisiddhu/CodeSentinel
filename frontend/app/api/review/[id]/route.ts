import { NextRequest, NextResponse } from 'next/server';
import { MOCK_REVIEW } from '@/lib/api';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

  // Proxy to real backend if available
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const backendRes = await fetch(`${backendUrl}/review/${id}`, {
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

  return NextResponse.json({
    ...MOCK_REVIEW,
    review_id: id,
    status: 'done',
  });
}
