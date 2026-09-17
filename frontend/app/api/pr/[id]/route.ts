import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

  // Try proxying to live backend if running
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const backendRes = await fetch(`${backendUrl}/pr/${id}`, {
      method: 'POST',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (backendRes.ok) {
      const data = await backendRes.json();
      return NextResponse.json(data);
    }
  } catch {
    // Backend unreachable, proceed to edge fallback
  }

  // Edge / Vercel fallback — delivers real GitHub PR compare link
  const repo = 'dasarisiddhu/CodeSentinel';
  const branch = 'codesentinel/fix-broken-app-secrets';
  return NextResponse.json({
    pr_number: 1,
    pr_url: `https://github.com/${repo}/pull/new/${branch}`,
    branch: branch,
    mocked: true,
  });
}
