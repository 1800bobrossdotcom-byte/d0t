'use client';

/**
 * DataModule — Base component for D0T modular grid
 * 
 * Each module is a self-contained data view with:
 * - Color-coded header
 * - Loading/error states
 * - Auto-refresh capability
 * - Consistent styling
 */

import { ReactNode } from 'react';

interface DataModuleProps {
  title: string;
  icon?: string;
  color: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  loading?: boolean;
  error?: string | null;
  children: ReactNode;
  refreshInterval?: number;
  lastUpdate?: string;
}

export function DataModule({
  title,
  icon = '📊',
  color,
  size = 'md',
  loading = false,
  error = null,
  children,
  lastUpdate,
}: DataModuleProps) {
  // Size-based height classes
  const sizeClasses = {
    sm: 'min-h-[200px]',
    md: 'min-h-[300px]',
    lg: 'min-h-[400px]',
    xl: 'min-h-[500px]',
  };

  return (
    <div 
      className={`rounded-xl overflow-hidden border ${sizeClasses[size]} flex flex-col bg-[#0F0F0F]`}
      style={{ borderColor: `${color}30` }}
    >
      {/* Header */}
      <div 
        className="px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor: `${color}15` }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span 
            className="font-mono text-sm font-semibold uppercase tracking-wide"
            style={{ color }}
          >
            {title}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {loading && (
            <div 
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: color }}
            />
          )}
          {lastUpdate && (
            <span className="text-xs text-[#555] font-mono">
              {new Date(lastUpdate).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex gap-1">
              <div 
                className="w-2 h-2 rounded-full animate-bounce"
                style={{ backgroundColor: color, animationDelay: '0ms' }}
              />
              <div 
                className="w-2 h-2 rounded-full animate-bounce"
                style={{ backgroundColor: color, animationDelay: '150ms' }}
              />
              <div 
                className="w-2 h-2 rounded-full animate-bounce"
                style={{ backgroundColor: color, animationDelay: '300ms' }}
              />
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <p className="text-red-400 text-sm mb-2">⚠️ {error}</p>
              <p className="text-[#555] text-xs">Check connection</p>
            </div>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// MODULE COLORS (from DESIGN-BIBLE)
// ════════════════════════════════════════════════════════════════

export const MODULE_COLORS = {
  treasury: '#00AA66',
  pulse: '#FF6B00',
  teamChat: '#0052FF',
  markets: '#8B5CF6',
  council: '#FFD700',
  trades: '#FF6B9D',
  quotes: '#00CCFF',
  learning: '#A855F7',
} as const;

export default DataModule;
