import { useState, useEffect } from "react";
import { useBridgeContext } from "@/contexts/BridgeContext.js";
import type { TokenStats, TokenEfficiency } from "@/types/bridge.js";

interface ModuleUsage {
  module: string;
  tokens: number;
  cost: number;
}

export function TokenChart() {
  const bridge = useBridgeContext();
  const [stats, setStats] = useState<ModuleUsage[]>([]);
  const [efficiency, setEfficiency] = useState<{ trend: Array<{ timestamp: number; efficiency: number }>; currentCost: number } | null>(null);

  useEffect(() => {
    if (bridge.status !== "connected") {
      setStats([]);
      setEfficiency(null);
      return;
    }

    // Request initial stats
    Promise.all([
      bridge.request("tokens/stats"),
      bridge.request("tokens/efficiency"),
    ]).then(([statsRes, effRes]) => {
      const statsData = statsRes as { stats: ModuleUsage[]; period: string } | null;
      if (statsData?.stats) {
        setStats(statsData.stats);
      }
      const effData = effRes as { trend: Array<{ timestamp: number; efficiency: number }>; currentCost: number } | null;
      if (effData) {
        setEfficiency(effData);
      }
    }).catch(() => {});

    // Subscribe to updates
    const unsubStats = bridge.subscribe("TOKEN_STATS", (msg: TokenStats) => {
      setStats(msg.stats);
    });

    const unsubEff = bridge.subscribe("TOKEN_EFFICIENCY", (msg: TokenEfficiency) => {
      setEfficiency({ trend: msg.trend, currentCost: msg.currentCost });
    });

    // Poll every 30 seconds
    const iv = setInterval(() => {
      void bridge.request("tokens/stats").then((res) => {
        const statsData = res as { stats: ModuleUsage[]; period: string } | null;
        if (statsData?.stats) {
          setStats(statsData.stats);
        }
      }).catch(() => {});
    }, 30000);

    return () => {
      unsubStats();
      unsubEff();
      clearInterval(iv);
    };
  }, [bridge]);

  const maxTokens = Math.max(...stats.map(s => s.tokens), 1);

  return (
    <div className="bg-surface border border-border rounded-skin p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-text">Token Usage (24h)</h2>
        {efficiency && (
          <span className="text-xs text-text-muted">
            Est. cost: ${efficiency.currentCost.toFixed(4)}
          </span>
        )}
      </div>

      {stats.length === 0 ? (
        <p className="text-xs text-text-muted">No token usage data</p>
      ) : (
        <div className="space-y-2">
          {stats.map((stat) => (
            <div key={stat.module} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text">{stat.module}</span>
                <span className="text-text-muted">
                  {stat.tokens.toLocaleString()} tokens
                </span>
              </div>
              <div className="h-2 bg-surface-2 rounded overflow-hidden">
                <div
                  className="h-full bg-primary/60 rounded transition-all duration-300"
                  style={{ width: `${(stat.tokens / maxTokens) * 100}%` }}
                />
              </div>
            </div>
          ))}

          {/* Efficiency trend line */}
          {efficiency && efficiency.trend.length > 1 && (
            <div className="mt-4 pt-3 border-t border-border">
              <p className="text-xs text-text-muted mb-2">Efficiency Trend</p>
              <div className="flex items-end gap-1 h-8">
                {efficiency.trend.slice(-20).map((point, i) => {
                  const maxEff = Math.max(...efficiency.trend.map(t => t.efficiency), 1);
                  const height = (point.efficiency / maxEff) * 100;
                  return (
                    <div
                      key={point.timestamp}
                      className="flex-1 bg-accent/60 rounded-sm"
                      style={{ height: `${height}%` }}
                      title={`${new Date(point.timestamp).toLocaleTimeString()}: ${point.efficiency.toFixed(2)}`}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
