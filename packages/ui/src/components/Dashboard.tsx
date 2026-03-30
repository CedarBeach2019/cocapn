import { useState, useEffect } from "react";
import { useBridgeContext } from "@/contexts/BridgeContext.js";
import { useBridge, type BridgeHandle } from "@/hooks/useBridge.js";
import { CloudStatus } from "./CloudStatus.js";
import { SkillPanel } from "./SkillPanel.js";
import { TokenChart } from "./TokenChart.js";
import { GraphExplorer } from "./GraphExplorer.js";
import { TreeSearchPanel } from "./TreeSearchPanel.js";

interface DashboardProps {
  className?: string;
}

export function Dashboard({ className = "" }: DashboardProps) {
  const bridge = useBridgeContext();
  const [uptime, setUptime] = useState(0);

  // ── Poll bridge uptime ───────────────────────────────────────────────────────

  useEffect(() => {
    if (bridge.status !== "connected") return;

    const poll = async () => {
      try {
        const status = await bridge.request("bridge/status") as { uptime: number } | null;
        if (status?.uptime) setUptime(status.uptime);
      } catch {
        // Ignore
      }
    };

    void poll();
    const iv = setInterval(() => void poll(), 5000);
    return () => clearInterval(iv);
  }, [bridge]);

  // ── Format uptime ─────────────────────────────────────────────────────────────

  const formatUptime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  // ── Quick actions ─────────────────────────────────────────────────────────────

  const handleQuickAction = async (action: string) => {
    try {
      switch (action) {
        case "sync":
          await bridge.request("bridge/sync");
          break;
        case "export":
          await bridge.request("brain/export");
          break;
        case "refresh-skills":
          await bridge.request("skills/refresh");
          break;
      }
    } catch (err) {
      console.error("Quick action failed:", err);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={`p-4 overflow-y-auto ${className}`}>
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header with status and uptime */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-text">Dashboard</h1>
          <div className="flex items-center gap-4 text-sm text-text-muted">
            <span>Uptime: {formatUptime(uptime)}</span>
            <button
              onClick={() => void handleQuickAction("sync")}
              className="px-3 py-1 rounded-skin border border-border hover:border-border/80 transition-colors"
            >
              Sync
            </button>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Cloud status */}
          <div className="lg:col-span-1">
            <CloudStatus />
          </div>

          {/* Quick actions */}
          <div className="lg:col-span-2 bg-surface border border-border rounded-skin p-4">
            <h2 className="text-sm font-semibold text-text mb-3">Quick Actions</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void handleQuickAction("sync")}
                className="px-3 py-2 bg-primary/10 text-primary rounded-skin text-sm hover:bg-primary/20 transition-colors"
              >
                Sync Repo
              </button>
              <button
                onClick={() => void handleQuickAction("export")}
                className="px-3 py-2 bg-primary/10 text-primary rounded-skin text-sm hover:bg-primary/20 transition-colors"
              >
                Export Knowledge
              </button>
              <button
                onClick={() => void handleQuickAction("refresh-skills")}
                className="px-3 py-2 bg-primary/10 text-primary rounded-skin text-sm hover:bg-primary/20 transition-colors"
              >
                Refresh Skills
              </button>
            </div>
          </div>

          {/* Token chart */}
          <div className="lg:col-span-2">
            <TokenChart />
          </div>

          {/* Skill panel */}
          <div className="lg:col-span-1">
            <SkillPanel />
          </div>

          {/* Graph explorer */}
          <div className="lg:col-span-2">
            <GraphExplorer />
          </div>

          {/* Tree search */}
          <div className="lg:col-span-1">
            <TreeSearchPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
