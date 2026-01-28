/**
 * D0T.FINANCE — Autonomous Wealth Intelligence
 * 
 * Inspired by 0TYPE minimalism.
 * Cooperative trading, collective wealth.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import TeamChat from './components/TeamChat';

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

interface TreasuryData {
  timestamp: string;
  treasury: {
    total: number;
    allocation: Record<string, number>;
  };
  performance: {
    totalPnL: number;
    wins: number;
    losses: number;
    winRate: number;
    totalTrades: number;
  };
  today: {
    pnl: number;
    trades: number;
    wins: number;
    losses: number;
  };
  recentTrades: Array<{
    timestamp: string;
    direction: string;
    market: string;
    size: number;
    price: number;
  }>;
  status: {
    connected: boolean;
    mode: string;
  };
}

interface PulseData {
  timestamp: string;
  cycle: number;
  phase: 'IDLE' | 'SCANNING' | 'DELIBERATING' | 'DECIDING' | 'EXECUTING' | 'OFFLINE' | 'ERROR';
  market: string | null;
  opportunity: string | null;
  agents: Record<string, {
    emoji: string;
    vote: 'YES' | 'NO' | null;
    confidence: number | null;
    reasoning: string | null;
  }>;
  consensus: number;
  blessing: boolean;
  decision: string | null;
  treasury: {
    total: number;
    todayPnL: number;
  };
}

// ══════════════════════════════════════════════════════════════
// STATIC DATA
// ══════════════════════════════════════════════════════════════

const AGENTS = [
  { id: 'bull', name: 'BULL', emoji: '🐂', role: 'Optimism Maximizer', winRate: 58.2 },
  { id: 'bear', name: 'BEAR', emoji: '🐻', role: 'Risk Assessor', winRate: 61.4 },
  { id: 'quant', name: 'QUANT', emoji: '📊', role: 'Statistical Edge', winRate: 64.1 },
  { id: 'risk', name: 'RISK', emoji: '🛡️', role: 'Capital Guardian', winRate: 72.0 },
  { id: 'arbiter', name: 'ARBITER', emoji: '⚖️', role: 'Final Authority', winRate: 67.5 },
];

const BLUECHIPS = [
  { symbol: 'BNKR', name: 'Banker', change: 82.9 },
  { symbol: 'DRB', name: 'DRB', change: -14.7 },
  { symbol: 'CLANKER', name: 'Clanker', change: 21.7 },
  { symbol: 'CLAWD', name: 'Clawd', change: 15954 },
];

const ALLOCATION_CONFIG = [
  { name: 'Polymarket', key: 'polymarket', color: '#8b5cf6' },
  { name: 'Base Meme', key: 'baseMeme', color: '#3b82f6' },
  { name: 'Bluechips', key: 'bluechips', color: '#22c55e' },
  { name: 'Treasury', key: 'treasury', color: '#f59e0b' },
  { name: 'Savings', key: 'savings', color: '#64748b' },
  { name: 'Emergency', key: 'emergency', color: '#ef4444' },
];

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════

export default function D0TFinance() {
  const [connected, setConnected] = useState(false);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [treasuryData, setTreasuryData] = useState<TreasuryData | null>(null);
  const [pulse, setPulse] = useState<PulseData | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Fetch treasury data
  const fetchTreasury = useCallback(async () => {
    try {
      const res = await fetch('/api/treasury');
      if (res.ok) {
        const data = await res.json();
        setTreasuryData(data);
        setConnected(true);
      }
    } catch (e) {
      console.error('Failed to fetch treasury:', e);
    }
  }, []);

  // Fetch pulse data (fast - every 1s)
  const fetchPulse = useCallback(async () => {
    try {
      const res = await fetch('/api/pulse');
      if (res.ok) {
        const data = await res.json();
        setPulse(data);
      }
    } catch (e) {
      console.error('Failed to fetch pulse:', e);
    }
  }, []);

  useEffect(() => {
    fetchTreasury();
    fetchPulse();
    const treasuryInterval = setInterval(fetchTreasury, 5000); // Refresh every 5s
    const pulseInterval = setInterval(fetchPulse, 1000); // Pulse every 1s
    return () => {
      clearInterval(treasuryInterval);
      clearInterval(pulseInterval);
    };
  }, [fetchTreasury, fetchPulse]);

  useEffect(() => {
    const messages = [
      '> Initializing Nash Cooperative Council...',
      '> 5 agents online: BULL, BEAR, QUANT, RISK, ARBITER',
      '> Connected to gamma-api.polymarket.com',
      '> Scanning Base pairs via Dexscreener',
      `> Treasury mode: $${treasuryData?.treasury.total || 300} paper balance`,
      '> Finding Nash Equilibrium...',
      '> Bull: "Market sentiment bullish on prediction markets"',
      '> Bear: "Caution - volatility above threshold"',
      '> Quant: "Edge detected at 8.2% on sports markets"',
      '> Risk: "Position size approved: $15 max"',
      '> Arbiter: "Consensus reached. Executing trade."',
      `> Session P&L: ${(treasuryData?.performance?.totalPnL ?? 0) >= 0 ? '+' : ''}$${(treasuryData?.performance?.totalPnL ?? 0).toFixed(2)}`,
      '> Distributing: 40% reinvest | 30% treasury | 20% savings | 10% DCA',
    ];
    
    let i = 0;
    const interval = setInterval(() => {
      setTerminalLines(prev => [...prev.slice(-15), messages[i % messages.length]]);
      i++;
    }, 2500);
    
    return () => clearInterval(interval);
  }, [treasuryData]);

  // Computed values
  const total = treasuryData?.treasury.total || 300;
  const pnl = treasuryData?.performance.totalPnL || 0;
  const trades = treasuryData?.performance.totalTrades || 0;
  const winRate = treasuryData?.performance.winRate || 0;
  const allocation = treasuryData?.treasury.allocation || {
    polymarket: 90, baseMeme: 75, bluechips: 45, treasury: 45, savings: 30, emergency: 15
  };

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLines]);

  return (
    <main className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA]">
      
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#2A2A2A] bg-[#0A0A0A]/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-mono tracking-tight flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`} />
            <span className="font-semibold">D0T</span>
            <span className="text-[#888]">.FINANCE</span>
          </Link>
          
          <div className="hidden md:flex items-center gap-8 text-sm">
            <a href="#agents" className="text-[#888] hover:text-white transition-colors">Agents</a>
            <a href="#terminal" className="text-[#888] hover:text-white transition-colors">Terminal</a>
            <a href="#portfolio" className="text-[#888] hover:text-white transition-colors">Portfolio</a>
            <a href="#philosophy" className="text-[#888] hover:text-white transition-colors">Philosophy</a>
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-xs font-mono text-[#555] hidden sm:block">by B0B</span>
            <a 
              href="https://bankr.bot" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs font-mono text-[#0052FF] border border-[#0052FF]/30 px-3 py-1.5 hover:bg-[#0052FF]/10 transition-colors"
            >
              POWERED BY BANKR
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="min-h-screen flex flex-col justify-center pt-16 px-6">
        <div className="max-w-7xl mx-auto w-full">
          <p className="text-sm font-mono text-[#888] mb-8 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Autonomous wealth intelligence by B0B
          </p>
          
          <div className="mb-16">
            <h1 className="text-[12vw] md:text-[10vw] lg:text-[8vw] font-light leading-[0.9] tracking-tight">
              <span className="block">Bankr-First</span>
              <span className="block">Architecture.</span>
              <span className="block text-[#888]">You sign. We build.</span>
            </h1>
          </div>
          
          {/* Architecture Banner */}
          <div className="mb-12 p-6 border border-[#0052FF]/30 bg-[#0052FF]/5 rounded-lg">
            <div className="grid md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-3xl mb-2">🧊</div>
                <div className="font-mono text-sm">COLD</div>
                <div className="text-xs text-[#555]">Your hardware wallet</div>
              </div>
              <div className="text-center">
                <div className="text-3xl mb-2">🌡️</div>
                <div className="font-mono text-sm">WARM</div>
                <div className="text-xs text-[#555]">Your Phantom</div>
              </div>
              <div className="text-center">
                <div className="text-3xl mb-2">🏦</div>
                <div className="font-mono text-sm">BANKR</div>
                <div className="text-xs text-[#555]">TX Builder</div>
              </div>
              <div className="text-center">
                <div className="text-3xl mb-2">🔐</div>
                <div className="font-mono text-sm">SECURE</div>
                <div className="text-xs text-[#555]">No keys stored</div>
              </div>
            </div>
          </div>
          
          {/* Stats Row - Live Data */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 border-t border-[#2A2A2A] pt-8">
            <div>
              <p className="text-4xl font-light">${total.toFixed(0)}</p>
              <p className="text-sm text-[#888]">Paper Balance</p>
            </div>
            <div>
              <p className={`text-4xl font-light ${pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
              </p>
              <p className="text-sm text-[#888]">Session P&L</p>
            </div>
            <div>
              <p className="text-4xl font-light">{trades}</p>
              <p className="text-sm text-[#888]">Trades Today</p>
            </div>
            <div>
              <p className="text-4xl font-light flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`} />
                {connected ? 'Live' : '...'}
              </p>
              <p className="text-sm text-[#888]">24/7 Autonomous</p>
            </div>
          </div>
        </div>
      </section>

      {/* Agents Section */}
      <section id="agents" className="py-24 px-6 border-t border-[#2A2A2A]">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-16">
            <h2 className="text-sm font-mono text-[#888]">The Nash Council</h2>
            <p className="text-sm text-[#555]">5 cooperative agents</p>
          </div>
          
          {/* Live Pulse Visualization */}
          {pulse && pulse.phase !== 'OFFLINE' && pulse.phase !== 'IDLE' && (
            <div className={`mb-12 p-6 border ${pulse.blessing ? 'border-yellow-500/50 bg-yellow-500/5' : 'border-[#2A2A2A] bg-[#141414]'} rounded-lg`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full animate-pulse ${
                    pulse.phase === 'SCANNING' ? 'bg-blue-500' :
                    pulse.phase === 'DELIBERATING' ? 'bg-yellow-500' :
                    pulse.phase === 'DECIDING' ? 'bg-purple-500' :
                    pulse.phase === 'EXECUTING' ? 'bg-green-500' : 'bg-zinc-500'
                  }`} />
                  <span className="text-sm font-mono uppercase">{pulse.phase}</span>
                  {pulse.blessing && (
                    <span className="text-xs font-mono text-yellow-500 border border-yellow-500/30 px-2 py-0.5 animate-pulse">
                      🌟 BLESSING DETECTED
                    </span>
                  )}
                </div>
                <span className="text-xs text-[#555]">Cycle {pulse.cycle}</span>
              </div>
              
              {pulse.opportunity && (
                <p className="text-sm text-[#888] mb-4 truncate">
                  {pulse.opportunity}
                </p>
              )}
              
              {/* Agent Votes */}
              <div className="grid grid-cols-5 gap-2">
                {Object.entries(pulse.agents).map(([name, agent]) => (
                  <div 
                    key={name}
                    className={`p-3 border rounded text-center transition-all duration-300 ${
                      agent.vote === 'YES' ? 'border-green-500/50 bg-green-500/10' :
                      agent.vote === 'NO' ? 'border-red-500/50 bg-red-500/10' :
                      'border-[#2A2A2A] bg-[#0A0A0A] opacity-50'
                    }`}
                  >
                    <span className="text-xl">{agent.emoji}</span>
                    <p className="text-xs font-mono mt-1">{name}</p>
                    {agent.vote && (
                      <p className={`text-xs font-bold mt-1 ${
                        agent.vote === 'YES' ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {agent.vote}
                      </p>
                    )}
                    {agent.confidence !== null && (
                      <p className="text-[10px] text-[#555]">{(agent.confidence * 100).toFixed(0)}%</p>
                    )}
                  </div>
                ))}
              </div>
              
              {/* Consensus Bar */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[#555]">Consensus</span>
                  <span className={pulse.consensus >= 0.65 ? 'text-green-500' : 'text-[#888]'}>
                    {(pulse.consensus * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-[#2A2A2A] rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 ${
                      pulse.blessing ? 'bg-yellow-500' :
                      pulse.consensus >= 0.65 ? 'bg-green-500' : 'bg-zinc-500'
                    }`}
                    style={{ width: `${pulse.consensus * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}
          
          <div className="space-y-1">
            {AGENTS.map((agent) => {
              const pulseAgent = pulse?.agents[agent.name.toUpperCase()];
              const isVoting = pulseAgent?.vote !== null;
              
              return (
                <div
                  key={agent.id}
                  className={`group block border-t border-[#2A2A2A] py-8 transition-colors -mx-6 px-6 ${
                    isVoting ? 'bg-[#141414]' : 'hover:bg-[#141414]'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-2">
                        <span className="text-3xl">{agent.emoji}</span>
                        <h3 className="text-3xl md:text-5xl font-light tracking-tight">
                          {agent.name}
                        </h3>
                        {isVoting && (
                          <span className={`text-sm font-mono px-2 py-1 rounded ${
                            pulseAgent?.vote === 'YES' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'
                          }`}>
                            {pulseAgent?.vote}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[#888]">{agent.role}</p>
                    </div>
                    
                    <div className="flex items-center gap-8 text-sm">
                      <div className="text-right">
                        <p className="text-2xl font-light text-green-500">{agent.winRate}%</p>
                        <p className="text-[#555]">Win Rate</p>
                      </div>
                      <span className={`w-2 h-2 rounded-full ${isVoting ? 'bg-yellow-500' : 'bg-green-500'} animate-pulse`} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Terminal Section */}
      <section id="terminal" className="py-24 px-6 border-t border-[#2A2A2A] bg-[#141414]">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-sm font-mono text-[#888]">Live Terminal</h2>
            <span className="flex items-center gap-2 text-xs text-green-500">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Connected
            </span>
          </div>
          
          <div className="border border-[#2A2A2A] bg-[#0A0A0A]">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2A2A2A]">
              <span className="w-3 h-3 rounded-full bg-red-500/80" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <span className="w-3 h-3 rounded-full bg-green-500/80" />
              <span className="ml-4 text-xs font-mono text-[#555]">nash-swarm-terminal</span>
            </div>
            
            <div 
              ref={terminalRef}
              className="p-6 h-80 overflow-y-auto font-mono text-sm"
              style={{ scrollbarWidth: 'thin', scrollbarColor: '#2A2A2A transparent' }}
            >
              <div className="text-green-500 mb-4">
                ══════════════════════════════════════════════════════════<br />
                &nbsp;&nbsp;🏦 D0T.FINANCE — NASH COOPERATIVE TRADING<br />
                &nbsp;&nbsp;Budget: ${total.toFixed(0)} | Agents: 5 | Mode: PAPER<br />
                ══════════════════════════════════════════════════════════
              </div>
              {terminalLines.map((line, i) => (
                <div key={i} className={`mb-1 ${
                  line.includes('WIN') ? 'text-green-500' : 
                  line.includes('Caution') ? 'text-yellow-500' :
                  line.includes('>') ? 'text-[#888]' : 'text-white'
                }`}>
                  {line}
                </div>
              ))}
              <div className="text-green-500 animate-pulse">▌</div>
            </div>
          </div>
        </div>
      </section>

      {/* Portfolio Section */}
      <section id="portfolio" className="py-24 px-6 border-t border-[#2A2A2A]">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16">
            
            {/* Allocation */}
            <div>
              <h2 className="text-sm font-mono text-[#888] mb-8">Treasury Allocation</h2>
              <div className="text-6xl font-light mb-8">${total.toFixed(2)}</div>
              
              {/* Allocation Bar */}
              <div className="h-3 rounded-full overflow-hidden flex mb-8">
                {ALLOCATION_CONFIG.map(a => {
                  const value = allocation[a.key as keyof typeof allocation] || 0;
                  const pct = total > 0 ? (value / total) * 100 : 0;
                  return (
                    <div 
                      key={a.name}
                      style={{ width: `${pct}%`, backgroundColor: a.color }}
                      className="first:rounded-l-full last:rounded-r-full"
                    />
                  );
                })}
              </div>
              
              <div className="space-y-4">
                {ALLOCATION_CONFIG.map(a => {
                  const value = allocation[a.key as keyof typeof allocation] || 0;
                  const pct = total > 0 ? ((value / total) * 100).toFixed(0) : '0';
                  return (
                    <div key={a.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: a.color }} />
                        <span className="text-[#888]">{a.name}</span>
                      </div>
                      <span className="font-mono">{pct}% · ${value.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Bluechips */}
            <div>
              <h2 className="text-sm font-mono text-[#888] mb-8">💎 Bluechip Watchlist</h2>
              <p className="text-[#555] mb-8">AI coins we&apos;re accumulating via DCA</p>
              
              <div className="space-y-6">
                {BLUECHIPS.map(coin => (
                  <div key={coin.symbol} className="flex items-center justify-between py-4 border-b border-[#2A2A2A]">
                    <div>
                      <p className="text-2xl font-light">${coin.symbol}</p>
                      <p className="text-sm text-[#555]">{coin.name}</p>
                    </div>
                    <div className={`text-xl font-mono ${coin.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {coin.change >= 0 ? '+' : ''}{coin.change > 1000 ? '🚀' : ''}{coin.change.toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-8 p-4 border border-[#2A2A2A] bg-[#141414]">
                <p className="text-sm text-[#888]">DCA Strategy</p>
                <p className="text-lg">10% of wins → distributed across AI bluechips</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Philosophy Section */}
      <section id="philosophy" className="py-24 px-6 border-t border-[#2A2A2A] bg-[#141414]">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16">
            <div>
              <h2 className="text-sm font-mono text-[#888] mb-4">The da0 Way</h2>
              <h3 className="text-4xl md:text-5xl font-light mb-6">
                Emergent Intelligence.<br />
                <span className="text-[#888]">Not programmed personalities.</span>
              </h3>
            </div>
            
            <div className="space-y-6 text-[#888]">
              <p>
                D0T agents start as <span className="text-white">blank slates</span>. No pre-assigned 
                specialties, no forced personalities. They observe markets, execute trades,
                and naturally develop affinities through real experience.
              </p>
              <p>
                Using Nash Game Theory, the cooperative council doesn&apos;t compete — 
                they collaborate. Each trade teaches. Patterns emerge. What you see
                is authentic intelligence, not artificial assignment.
              </p>
              <p>
                <span className="text-[#0052FF]">Bankr-First Architecture:</span> We build transactions,
                you sign them in Phantom. No private keys stored. Maximum security, full transparency.
              </p>
              
              <div className="grid grid-cols-2 gap-4 pt-4">
                <div className="p-4 border border-[#2A2A2A]">
                  <p className="text-2xl mb-1">🌱</p>
                  <p className="text-white text-sm">Blank Slate</p>
                  <p className="text-xs text-[#555]">Identity emerges through experience</p>
                </div>
                <div className="p-4 border border-[#2A2A2A]">
                  <p className="text-2xl mb-1">🧬</p>
                  <p className="text-white text-sm">Emergent Affinities</p>
                  <p className="text-xs text-[#555]">Natural specialization</p>
                </div>
                <div className="p-4 border border-[#2A2A2A]">
                  <p className="text-2xl mb-1">🔐</p>
                  <p className="text-white text-sm">You Control Keys</p>
                  <p className="text-xs text-[#555]">Bankr builds, you sign</p>
                </div>
                <div className="p-4 border border-[#2A2A2A]">
                  <p className="text-2xl mb-1">🐝</p>
                  <p className="text-white text-sm">Swarm Learning</p>
                  <p className="text-xs text-[#555]">One d0t&apos;s insight helps all</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Team Chat Section */}
      <section className="py-24 px-6 border-t border-[#2A2A2A]">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-sm font-mono text-[#888] mb-1">GLASS BOX</h2>
              <p className="text-xs text-[#555]">See how we think. Transparent AI coordination.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-[#555]">LIVE</span>
            </div>
          </div>
          <TeamChat />
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6 border-t border-[#2A2A2A]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-5xl md:text-7xl font-light mb-8">
            Let the swarm work.
          </h2>
          <p className="text-xl text-[#888] mb-12 max-w-xl mx-auto">
            Paper trading now. Real wealth soon. Autonomous, cooperative, 24/7.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="#terminal" className="border border-white px-8 py-4 text-sm hover:bg-white hover:text-black transition-colors">
              Watch Live Terminal
            </a>
            <a href="https://0type.b0b.dev" className="border border-[#2A2A2A] px-8 py-4 text-sm text-[#888] hover:border-[#888] transition-colors">
              Visit 0TYPE
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-[#2A2A2A]">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between gap-8">
            <div>
              <p className="text-xl font-mono tracking-tight mb-2">
                <span className="font-semibold">D0T</span>.FINANCE
              </p>
              <p className="text-sm text-[#888]">
                Autonomous wealth by B0B
              </p>
            </div>
            
            <div className="flex gap-12 text-sm">
              <div className="space-y-2">
                <p className="text-[#888]">B0B Ecosystem</p>
                <a href="https://0type.b0b.dev" className="block text-[#555] hover:text-white">0TYPE</a>
                <a href="https://b0b.dev" className="block text-[#555] hover:text-white">B0B.DEV</a>
                <a href="https://github.com/b0bthebuilder" className="block text-[#555] hover:text-white">GitHub</a>
              </div>
              
              <div className="space-y-2">
                <p className="text-[#888]">Markets</p>
                <span className="block text-[#555]">Polymarket</span>
                <span className="block text-[#555]">Base Memecoins</span>
                <span className="block text-[#555]">AI Bluechips</span>
              </div>
            </div>
          </div>
          
          <div className="mt-12 pt-8 border-t border-[#2A2A2A] flex flex-col md:flex-row justify-between gap-4 text-sm text-[#555]">
            <p>© 2026 D0T.FINANCE. A B0B project.</p>
            <p>Paper trading mode · Built on Base</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
