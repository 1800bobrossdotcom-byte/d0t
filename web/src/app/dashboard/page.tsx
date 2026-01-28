'use client';

/**
 * D0T Modular Dashboard — Grid-based data visualization
 * 
 * Full color branding with neural connectivity to brain.
 * Real-time data from brain APIs + live trading.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { DataModule, MODULE_COLORS } from '../components/DataModule';

// ════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════

interface TeamQuote {
  text: string;
  agent: string;
  emoji?: string;
  source?: string;
}

interface Discussion {
  id: string;
  title: string;
  status: string;
  participants: string[];
  messageCount: number;
}

interface Learning {
  id?: string;
  title: string;
  summary: string;
  category?: string;
  authors?: string[];
}

interface TradeHistory {
  timestamp: string;
  direction: string;
  market: string;
  size: number;
  price: number;
}

// ════════════════════════════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════════════════════════════

const BRAIN_URL = process.env.NEXT_PUBLIC_BRAIN_URL || 'https://b0b-brain-production.up.railway.app';

const AGENT_EMOJIS: Record<string, string> = {
  'b0b': '🎨',
  'r0ss': '🔧',
  'c0m': '💀',
  'd0t': '👁️',
  'HQ': '👑',
  'hq': '👑',
};

// ════════════════════════════════════════════════════════════════
// DASHBOARD PAGE
// ════════════════════════════════════════════════════════════════

export default function ModularDashboard() {
  // State for each module
  const [loading, setLoading] = useState({
    treasury: true,
    pulse: true,
    discussions: true,
    quotes: true,
    learnings: true,
    trades: true,
  });
  
  const [treasury, setTreasury] = useState({ total: 300, pnl: 0, trades: 0, winRate: 0 });
  const [pulse, setPulse] = useState({ phase: 'IDLE', cycle: 0, consensus: 0 });
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [quotes, setQuotes] = useState<TeamQuote[]>([]);
  const [learnings, setLearnings] = useState<Learning[]>([]);
  const [trades, setTrades] = useState<TradeHistory[]>([]);
  const [currentQuote, setCurrentQuote] = useState(0);

  // Fetch brain data
  const fetchBrainData = useCallback(async () => {
    // Discussions
    try {
      const discRes = await fetch(`${BRAIN_URL}/discussions`);
      if (discRes.ok) {
        const data = await discRes.json();
        setDiscussions(data.discussions || []);
      }
      setLoading(prev => ({ ...prev, discussions: false }));
    } catch { setLoading(prev => ({ ...prev, discussions: false })); }

    // Quotes
    try {
      const quotesRes = await fetch(`${BRAIN_URL}/api/quotes/live?limit=10`);
      if (quotesRes.ok) {
        const data = await quotesRes.json();
        setQuotes(data.quotes || []);
      }
      setLoading(prev => ({ ...prev, quotes: false }));
    } catch { setLoading(prev => ({ ...prev, quotes: false })); }

    // Learnings
    try {
      const learnRes = await fetch(`${BRAIN_URL}/api/learnings`);
      if (learnRes.ok) {
        const data = await learnRes.json();
        setLearnings(data.learnings || []);
      }
      setLoading(prev => ({ ...prev, learnings: false }));
    } catch { setLoading(prev => ({ ...prev, learnings: false })); }
  }, []);

  // Fetch local treasury/pulse
  const fetchLocalData = useCallback(async () => {
    // Treasury
    try {
      const treasuryRes = await fetch('/api/treasury');
      if (treasuryRes.ok) {
        const data = await treasuryRes.json();
        setTreasury({
          total: data.treasury?.total || 300,
          pnl: data.performance?.totalPnL || 0,
          trades: data.performance?.totalTrades || 0,
          winRate: data.performance?.winRate || 0,
        });
        setTrades(data.recentTrades || []);
        setLoading(prev => ({ ...prev, treasury: false, trades: false }));
      }
    } catch { setLoading(prev => ({ ...prev, treasury: false, trades: false })); }

    // Pulse
    try {
      const pulseRes = await fetch('/api/pulse');
      if (pulseRes.ok) {
        const data = await pulseRes.json();
        setPulse({
          phase: data.phase || 'IDLE',
          cycle: data.cycle || 0,
          consensus: data.consensus || 0,
        });
        setLoading(prev => ({ ...prev, pulse: false }));
      }
    } catch { setLoading(prev => ({ ...prev, pulse: false })); }
  }, []);

  useEffect(() => {
    fetchBrainData();
    fetchLocalData();
    
    // Refresh intervals
    const brainInterval = setInterval(fetchBrainData, 30000); // 30s
    const localInterval = setInterval(fetchLocalData, 3000); // 3s
    
    return () => {
      clearInterval(brainInterval);
      clearInterval(localInterval);
    };
  }, [fetchBrainData, fetchLocalData]);

  // Rotate quotes
  useEffect(() => {
    if (quotes.length === 0) return;
    const interval = setInterval(() => {
      setCurrentQuote(prev => (prev + 1) % quotes.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [quotes.length]);

  const quote = quotes[currentQuote];

  return (
    <main className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA]">
      
      {/* Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#2A2A2A] bg-[#0A0A0A]/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="text-lg font-mono tracking-tight flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="font-semibold">D0T</span>
            <span className="text-[#555]">.MODULAR</span>
          </Link>
          
          <div className="flex items-center gap-4 text-xs font-mono text-[#555]">
            <span>Cycle {pulse.cycle}</span>
            <span className="text-[#0052FF]">{pulse.phase}</span>
          </div>
        </div>
      </nav>

      {/* Grid Dashboard */}
      <div className="pt-20 pb-8 px-4 md:px-6 max-w-[1800px] mx-auto">
        
        {/* Top Row: Treasury + Pulse + Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          
          {/* Treasury Module */}
          <DataModule
            title="Treasury"
            icon="🏦"
            color={MODULE_COLORS.treasury}
            size="md"
            loading={loading.treasury}
          >
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-5xl font-light">${treasury.total.toFixed(0)}</p>
                <p className="text-sm text-[#555]">Paper Balance</p>
              </div>
              
              <div className="grid grid-cols-3 gap-4 text-center pt-4 border-t border-[#2A2A2A]">
                <div>
                  <p className={`text-xl font-mono ${treasury.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {treasury.pnl >= 0 ? '+' : ''}{treasury.pnl.toFixed(2)}
                  </p>
                  <p className="text-xs text-[#555]">P&L</p>
                </div>
                <div>
                  <p className="text-xl font-mono">{treasury.trades}</p>
                  <p className="text-xs text-[#555]">Trades</p>
                </div>
                <div>
                  <p className="text-xl font-mono text-green-500">{treasury.winRate.toFixed(0)}%</p>
                  <p className="text-xs text-[#555]">Win Rate</p>
                </div>
              </div>
            </div>
          </DataModule>

          {/* Pulse Module */}
          <DataModule
            title="Pulse"
            icon="💓"
            color={MODULE_COLORS.pulse}
            size="md"
            loading={loading.pulse}
          >
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <div className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl ${
                pulse.phase === 'IDLE' ? 'bg-[#2A2A2A]' :
                pulse.phase === 'SCANNING' ? 'bg-blue-500/20 animate-pulse' :
                pulse.phase === 'DELIBERATING' ? 'bg-yellow-500/20 animate-pulse' :
                pulse.phase === 'EXECUTING' ? 'bg-green-500/20 animate-pulse' :
                'bg-[#2A2A2A]'
              }`}>
                {pulse.phase === 'IDLE' ? '😴' :
                 pulse.phase === 'SCANNING' ? '👀' :
                 pulse.phase === 'DELIBERATING' ? '🤔' :
                 pulse.phase === 'EXECUTING' ? '⚡' : '🧠'}
              </div>
              
              <div className="text-center">
                <p className="text-lg font-mono uppercase" style={{ color: MODULE_COLORS.pulse }}>
                  {pulse.phase}
                </p>
                <p className="text-xs text-[#555]">Cycle {pulse.cycle}</p>
              </div>
              
              {pulse.consensus > 0 && (
                <div className="w-full">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#555]">Consensus</span>
                    <span className={pulse.consensus >= 0.65 ? 'text-green-500' : 'text-[#888]'}>
                      {(pulse.consensus * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 bg-[#2A2A2A] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-orange-500 to-yellow-500 transition-all"
                      style={{ width: `${pulse.consensus * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </DataModule>

          {/* Live Quotes Module */}
          <DataModule
            title="Team Wisdom"
            icon="💬"
            color={MODULE_COLORS.quotes}
            size="md"
            loading={loading.quotes}
          >
            {quote ? (
              <div className="flex flex-col justify-center h-full space-y-4">
                <div className="text-center">
                  <span className="text-4xl mb-4 block">
                    {quote.emoji || AGENT_EMOJIS[quote.agent] || '💬'}
                  </span>
                  <p className="text-lg italic leading-relaxed">
                    &ldquo;{quote.text}&rdquo;
                  </p>
                  <p className="text-sm mt-4" style={{ color: MODULE_COLORS.quotes }}>
                    — {quote.agent}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-[#555]">
                No quotes loaded
              </div>
            )}
          </DataModule>
        </div>

        {/* Middle Row: Team Chat + Council */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          
          {/* Discussions Module */}
          <DataModule
            title="Team Discussions"
            icon="🧠"
            color={MODULE_COLORS.teamChat}
            size="lg"
            loading={loading.discussions}
          >
            <div className="space-y-2">
              {discussions.length > 0 ? (
                discussions.slice(0, 6).map((disc) => (
                  <a
                    key={disc.id}
                    href={`${BRAIN_URL}/discussions/${disc.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 rounded-lg border border-[#2A2A2A] hover:border-[#0052FF]/50 transition-colors"
                  >
                    <p className="text-sm font-medium truncate">{disc.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-[#555]">
                        {disc.participants?.map(p => AGENT_EMOJIS[p] || '🤖').join(' ')}
                      </span>
                      <span className="text-xs text-[#555]">· {disc.messageCount} msgs</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        disc.status === 'active' ? 'bg-green-500/20 text-green-400' :
                        disc.status === 'planning' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-[#2A2A2A] text-[#555]'
                      }`}>
                        {disc.status}
                      </span>
                    </div>
                  </a>
                ))
              ) : (
                <div className="text-center text-[#555] py-8">
                  No discussions found
                </div>
              )}
            </div>
          </DataModule>

          {/* Learnings Module */}
          <DataModule
            title="Learning Library"
            icon="📚"
            color={MODULE_COLORS.learning}
            size="lg"
            loading={loading.learnings}
          >
            <div className="space-y-3">
              {learnings.length > 0 ? (
                learnings.map((learn, i) => (
                  <div
                    key={learn.id || i}
                    className="p-3 rounded-lg border border-[#2A2A2A]"
                  >
                    <p className="text-sm font-medium">{learn.title}</p>
                    <p className="text-xs text-[#555] mt-1 line-clamp-2">{learn.summary}</p>
                    {learn.authors && (
                      <p className="text-xs mt-2" style={{ color: MODULE_COLORS.learning }}>
                        {learn.authors.join(', ')}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center text-[#555] py-8">
                  No learnings yet
                </div>
              )}
            </div>
          </DataModule>
        </div>

        {/* Bottom Row: Recent Trades */}
        <div className="grid grid-cols-1 gap-4">
          <DataModule
            title="Recent Trades"
            icon="📈"
            color={MODULE_COLORS.trades}
            size="sm"
            loading={loading.trades}
          >
            {trades.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[#555] text-xs">
                      <th className="text-left pb-2">Time</th>
                      <th className="text-left pb-2">Market</th>
                      <th className="text-right pb-2">Direction</th>
                      <th className="text-right pb-2">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.slice(0, 5).map((trade, i) => (
                      <tr key={i} className="border-t border-[#2A2A2A]">
                        <td className="py-2 text-[#555]">
                          {new Date(trade.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-2 font-mono">{trade.market}</td>
                        <td className={`py-2 text-right ${
                          trade.direction === 'BUY' || trade.direction === 'YES' 
                            ? 'text-green-500' : 'text-red-500'
                        }`}>
                          {trade.direction}
                        </td>
                        <td className="py-2 text-right font-mono">${trade.size}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center text-[#555] py-4">
                No recent trades
              </div>
            )}
          </DataModule>
        </div>

      </div>

      {/* Footer */}
      <footer className="border-t border-[#2A2A2A] py-8 text-center">
        <p className="text-xs text-[#555]">
          D0T.FINANCE — Autonomous Wealth Intelligence by B0B
        </p>
      </footer>
    </main>
  );
}
