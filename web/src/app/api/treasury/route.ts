/**
 * Treasury API Route
 * Serves real-time treasury and trading data from the swarm
 */

import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Path to b0b-finance data files
const FINANCE_DIR = join(process.cwd(), '..', '..', 'b0b-finance');

interface TreasuryState {
  totalCapital: number;
  agentBudgets: {
    polymarket: number;
    baseMeme: number;
    bluechips: number;
  };
  reserves: {
    treasury: number;
    savings: number;
    emergency: number;
  };
  performance: {
    totalPnL: number;
    wins: number;
    losses: number;
    totalWins: number;
    totalLosses: number;
  };
  bluechipHoldings: Record<string, { amount: number; avgCost: number }>;
  dailyStats: Record<string, { pnl: number; trades: number; wins: number; losses: number }>;
  learnings: {
    optimalConfidence: number;
    bestTimeOfDay: string | null;
    avgWinSize: number;
    avgLossSize: number;
  };
}

interface Trade {
  timestamp: string;
  type: string;
  market: string;
  marketId?: string;
  direction: string;
  size: number;
  price: number;
  confidence?: number;
  method?: string;
}

function loadTreasuryState(): TreasuryState | null {
  try {
    const statePath = join(FINANCE_DIR, 'treasury-state.json');
    if (existsSync(statePath)) {
      return JSON.parse(readFileSync(statePath, 'utf-8'));
    }
  } catch (e) {
    console.error('Error loading treasury state:', e);
  }
  return null;
}

function loadTradeLog(): Trade[] {
  try {
    const logPath = join(FINANCE_DIR, 'trade-log.json');
    if (existsSync(logPath)) {
      return JSON.parse(readFileSync(logPath, 'utf-8'));
    }
  } catch (e) {
    console.error('Error loading trade log:', e);
  }
  return [];
}

function loadCooperativeState(): any {
  try {
    const statePath = join(FINANCE_DIR, 'cooperative-trader-state.json');
    if (existsSync(statePath)) {
      return JSON.parse(readFileSync(statePath, 'utf-8'));
    }
  } catch (e) {}
  return null;
}

export async function GET() {
  const treasury = loadTreasuryState();
  const trades = loadTradeLog();
  const cooperativeState = loadCooperativeState();

  // Default values if no state file exists
  const defaultTreasury: TreasuryState = {
    totalCapital: 300,
    agentBudgets: {
      polymarket: 90,
      baseMeme: 75,
      bluechips: 45,
    },
    reserves: {
      treasury: 45,
      savings: 30,
      emergency: 15,
    },
    performance: {
      totalPnL: 0,
      wins: 0,
      losses: 0,
      totalWins: 0,
      totalLosses: 0,
    },
    bluechipHoldings: {},
    dailyStats: {},
    learnings: {
      optimalConfidence: 65,
      bestTimeOfDay: null,
      avgWinSize: 0,
      avgLossSize: 0,
    },
  };

  const state = treasury || defaultTreasury;

  // Calculate stats
  const totalTrades = state.performance.wins + state.performance.losses;
  const winRate = totalTrades > 0 
    ? ((state.performance.wins / totalTrades) * 100).toFixed(1) 
    : '0.0';

  // Today's stats
  const today = new Date().toISOString().split('T')[0];
  const todayStats = state.dailyStats[today] || { pnl: 0, trades: 0, wins: 0, losses: 0 };

  // Format response
  const response = {
    timestamp: new Date().toISOString(),
    treasury: {
      total: state.totalCapital,
      allocation: {
        polymarket: state.agentBudgets.polymarket,
        baseMeme: state.agentBudgets.baseMeme,
        bluechips: state.agentBudgets.bluechips,
        treasury: state.reserves.treasury,
        savings: state.reserves.savings,
        emergency: state.reserves.emergency,
      },
    },
    performance: {
      totalPnL: state.performance.totalPnL,
      wins: state.performance.wins,
      losses: state.performance.losses,
      winRate: parseFloat(winRate),
      totalTrades,
    },
    today: todayStats,
    recentTrades: trades.slice(-10).reverse(),
    opportunities: cooperativeState?.opportunities?.slice(0, 5) || [],
    bluechipHoldings: Object.entries(state.bluechipHoldings).map(([symbol, data]) => ({
      symbol,
      amount: (data as any).amount,
      avgCost: (data as any).avgCost,
    })),
    learnings: state.learnings,
    status: {
      connected: true,
      mode: 'paper',
      lastUpdate: new Date().toISOString(),
    },
  };

  return NextResponse.json(response);
}
