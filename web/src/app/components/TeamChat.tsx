'use client';

/**
 * TeamChat Component
 * 
 * Displays live B0B collective discussions.
 * Fetches from brain server — real conversations, not hardcoded.
 * Transparent by default - glass box, not black box.
 */

import { useState, useEffect } from 'react';

// Brain server URL
const BRAIN_URL = process.env.NEXT_PUBLIC_BRAIN_URL || 'https://b0b-brain-production.up.railway.app';

interface Message {
  agent: string;
  emoji: string;
  role: string;
  timestamp: string;
  content: string;
}

interface Thread {
  id: string;
  topic: string;
  timestamp: string;
  status: string;
  outcome: string | null;
  messages: Message[];
}

// Fallback messages when brain is offline
const FALLBACK_MESSAGES: Message[] = [
  {
    agent: "b0b",
    emoji: "🎨",
    role: "Creative Director",
    timestamp: new Date().toISOString(),
    content: "brain server connecting...\ncheck labs for full status."
  }
];

const AGENT_COLORS: Record<string, { gradient: string; text: string }> = {
  b0b: { gradient: 'from-cyan-500 to-blue-600', text: 'text-cyan-400' },
  r0ss: { gradient: 'from-amber-500 to-orange-600', text: 'text-amber-400' },
  c0m: { gradient: 'from-purple-500 to-violet-600', text: 'text-purple-400' },
  d0t: { gradient: 'from-green-500 to-emerald-600', text: 'text-green-400' },
};

export default function TeamChat({ compact = false }: { compact?: boolean }) {
  const [messages, setMessages] = useState<Message[]>(FALLBACK_MESSAGES);
  const [mounted, setMounted] = useState(false);
  const [brainOnline, setBrainOnline] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Fetch live discussions from brain
    async function fetchDiscussions() {
      try {
        const res = await fetch(`${BRAIN_URL}/archive?limit=10`);
        if (res.ok) {
          const data = await res.json();
          const threads = data.threads || [];
          
          // Flatten messages from all threads
          const allMessages: Message[] = [];
          threads.forEach((thread: Thread) => {
            if (thread.messages) {
              allMessages.push(...thread.messages);
            }
          });
          
          if (allMessages.length > 0) {
            // Sort by timestamp, newest first
            allMessages.sort((a, b) => 
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
            setMessages(allMessages.slice(0, compact ? 3 : 10));
            setBrainOnline(true);
          }
        }
      } catch {
        setBrainOnline(false);
      }
    }
    
    fetchDiscussions();
    const interval = setInterval(fetchDiscussions, 30000); // 30s refresh
    return () => clearInterval(interval);
  }, [compact]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const displayMessages = compact ? messages.slice(-3) : messages;

  return (
    <div className="border border-[#2A2A2A] bg-[#0A0A0A]/50 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#2A2A2A] bg-[#141414]/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[#888]">#general-hq</span>
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        </div>
        <span className="text-xs text-[#555]">
          {mounted ? (brainOnline ? 'Live' : 'Cached') : '...'}
        </span>
      </div>

      {/* Messages */}
      <div className={`p-4 space-y-4 ${compact ? 'max-h-[200px]' : 'max-h-[400px]'} overflow-y-auto`}>
        {displayMessages.map((msg, i) => {
          const colors = AGENT_COLORS[msg.agent] || AGENT_COLORS.b0b;
          return (
            <div key={i} className="flex gap-3">
              <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${colors.gradient} flex items-center justify-center flex-shrink-0 text-sm`}>
                {msg.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`font-bold text-sm ${colors.text}`}>{msg.agent}</span>
                  <span className="text-xs text-[#555]">{formatTime(msg.timestamp)}</span>
                </div>
                <p className="text-sm text-[#AAAAAA] leading-relaxed whitespace-pre-line">
                  {msg.content}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-[#2A2A2A] bg-[#141414]/50">
        <p className="text-xs text-[#555] font-mono">
          Transparent by default • <a href="https://b0b.dev" className="text-cyan-500 hover:underline">b0b.dev</a>
        </p>
      </div>
    </div>
  );
}
