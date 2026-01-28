/**
 * Polymarket API Route
 * Serves live Polymarket data from crawler
 */

import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Path to crawler data
const DATA_FILE = join(process.cwd(), '..', '..', '..', 'brain', 'data', 'polymarket.json');

export async function GET() {
  try {
    // Try to read from crawler data
    if (existsSync(DATA_FILE)) {
      const data = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
      return NextResponse.json(data);
    }

    // Return mock data if crawler hasn't run
    return NextResponse.json({
      crawler: 'polymarket',
      timestamp: new Date().toISOString(),
      data: {
        markets: [],
        trending: [],
        volume24h: 0,
        fetchedAt: new Date().toISOString(),
        message: 'Crawler data not available. Run: node crawlers/polymarket-crawler.js once'
      }
    });

  } catch (error) {
    console.error('Polymarket API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Polymarket data' },
      { status: 500 }
    );
  }
}
