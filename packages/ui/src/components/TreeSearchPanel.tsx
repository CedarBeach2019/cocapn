import { useState, useEffect } from "react";
import { useBridgeContext } from "@/contexts/BridgeContext.js";
import type { TreeSearch, TreeSearchStatus } from "@/types/bridge.js";

interface Approach {
  name: string;
  progress: number;
  result?: {
    passRate: number;
    qualityScore: number;
  };
}

interface ActiveTree {
  searchId: string;
  status: "running" | "completed" | "failed";
  approaches: Approach[];
}

export function TreeSearchPanel() {
  const bridge = useBridgeContext();
  const [activeTrees, setActiveTrees] = useState<ActiveTree[]>([]);
  const [recentResults, setRecentResults] = useState<Array<{
    searchId: string;
    approachName: string;
    passRate: number;
    qualityScore: number;
  }>>([]);

  useEffect(() => {
    if (bridge.status !== "connected") {
      setActiveTrees([]);
      setRecentResults([]);
      return;
    }

    // Request initial status
    void bridge.request("treeSearch/status").then((res) => {
      const status = res as TreeSearchStatus | null;
      if (status) {
        setRecentResults(status.recentResults ?? []);
      }
    }).catch(() => {});

    // Subscribe to tree search updates
    const unsubStatus = bridge.subscribe("TREE_SEARCH_STATUS", (msg: TreeSearchStatus) => {
      setRecentResults(msg.recentResults ?? []);
    });

    const unsubSearch = bridge.subscribe("TREE_SEARCH", (msg: TreeSearch) => {
      setActiveTrees(prev => {
        const existing = prev.findIndex(t => t.searchId === msg.searchId);
        const newTree: ActiveTree = {
          searchId: msg.searchId,
          status: msg.status,
          approaches: msg.approaches ?? [],
        };
        if (existing === -1) {
          return [...prev, newTree];
        }
        const updated = [...prev];
        updated[existing] = newTree;
        return updated.filter(t => t.status !== "completed");
      });
    });

    return () => {
      unsubStatus();
      unsubSearch();
    };
  }, [bridge]);

  const handleStartTreeSearch = async () => {
    try {
      await bridge.request("treeSearch/start", {
        task: "Generate implementation plan for current task",
      });
    } catch (err) {
      console.error("Failed to start tree search:", err);
    }
  };

  return (
    <div className="bg-surface border border-border rounded-skin p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-text">Tree Search</h2>
        <button
          onClick={() => void handleStartTreeSearch()}
          className="px-2 py-1 bg-primary/10 text-primary rounded text-xs hover:bg-primary/20 transition-colors"
        >
          New Search
        </button>
      </div>

      {/* Active searches */}
      {activeTrees.length > 0 && (
        <div className="mb-3 pb-3 border-b border-border">
          <p className="text-xs text-text-muted mb-2">Active Searches ({activeTrees.length})</p>
          <div className="space-y-2">
            {activeTrees.map((tree) => (
              <div key={tree.searchId} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text font-mono">{tree.searchId.slice(0, 8)}</span>
                  <span className={[
                    "text-[10px] px-1 rounded",
                    tree.status === "running" ? "bg-accent/10 text-accent" : "bg-surface-2 text-text-muted",
                  ].join(" ")}>
                    {tree.status}
                  </span>
                </div>
                {tree.approaches.map((approach) => (
                  <div key={approach.name} className="ml-2 space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-text-muted">
                      <span>{approach.name}</span>
                      <span>{approach.progress}%</span>
                    </div>
                    <div className="h-1 bg-surface-2 rounded overflow-hidden">
                      <div
                        className="h-full bg-accent rounded transition-all duration-300"
                        style={{ width: `${approach.progress}%` }}
                      />
                    </div>
                    {approach.result && (
                      <div className="flex items-center gap-2 text-[10px] text-text-muted">
                        <span>Pass: {approach.result.passRate}%</span>
                        <span>Quality: {approach.result.qualityScore}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent results */}
      {recentResults.length > 0 && (
        <div>
          <p className="text-xs text-text-muted mb-2">Recent Results</p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {recentResults.slice(0, 5).map((result, i) => (
              <div
                key={`${result.searchId}-${i}`}
                className="flex items-center justify-between p-2 bg-surface-2 rounded text-xs"
              >
                <span className="text-text truncate flex-1">{result.approachName}</span>
                <div className="flex items-center gap-2 text-[10px] text-text-muted shrink-0">
                  <span className="text-success">{result.passRate}%</span>
                  <span>⭐ {result.qualityScore}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTrees.length === 0 && recentResults.length === 0 && (
        <p className="text-xs text-text-muted">No active searches</p>
      )}
    </div>
  );
}
