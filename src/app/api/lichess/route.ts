import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fen = searchParams.get('fen');
  const type = searchParams.get('type'); // 'cloud-eval' or 'explorer'

  if (!fen) {
    return NextResponse.json({ error: 'FEN is required' }, { status: 400 });
  }

  const apiKey = process.env.LICHESS_API_KEY;
  const headers: HeadersInit = apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {};

  try {
    let url = '';
    if (type === 'cloud-eval') {
      url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}`;
    } else {
      // explorer
      url = `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(fen)}&moves=0`;
    }

    const res = await fetch(url, { headers });
    
    // Gracefully handle "Not Found" - common for rare endgame positions
    if (res.status === 404) {
      return NextResponse.json(null);
    }

    if (!res.ok) {
      // For other errors (rate limits, etc.), return the status
      return NextResponse.json({ error: 'Lichess API error' }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Lichess proxy error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
