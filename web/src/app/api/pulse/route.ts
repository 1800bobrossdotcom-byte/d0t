/**
 * D0T.FINANCE — Pulse API
 * 
 * Live heartbeat from the swarm treasury.
 * Returns real-time deliberation state for dashboard visualization.
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // Read pulse file from b0b-finance
    const pulsePath = path.join(process.cwd(), '..', 'b0b-finance', 'swarm-pulse.json');
    
    if (fs.existsSync(pulsePath)) {
      const pulse = JSON.parse(fs.readFileSync(pulsePath, 'utf-8'));
      return NextResponse.json(pulse);
    }
    
    // Return default idle state if no pulse file
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      cycle: 0,
      phase: 'OFFLINE',
      market: null,
      opportunity: null,
      agents: {
        BULL: { emoji: '🐂', vote: null, confidence: null, reasoning: null },
        BEAR: { emoji: '🐻', vote: null, confidence: null, reasoning: null },
        QUANT: { emoji: '📊', vote: null, confidence: null, reasoning: null },
        RISK: { emoji: '🛡️', vote: null, confidence: null, reasoning: null },
        ARBITER: { emoji: '⚖️', vote: null, confidence: null, reasoning: null },
      },
      consensus: 0,
      blessing: false,
      decision: null,
      treasury: { total: 0, todayPnL: 0 },
    });
    
  } catch (error) {
    console.error('Pulse API error:', error);
    return NextResponse.json(
      { error: 'Failed to read pulse', phase: 'ERROR' },
      { status: 500 }
    );
  }
}
