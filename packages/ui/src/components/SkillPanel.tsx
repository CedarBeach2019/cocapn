import { useState, useEffect } from "react";
import { useBridgeContext } from "@/contexts/BridgeContext.js";
import type { SkillList, SkillStats } from "@/types/bridge.js";

interface Skill {
  id: string;
  name: string;
  loaded: boolean;
  tolerance: number;
  memoryUsage: number;
  matchCount: number;
}

export function SkillPanel() {
  const bridge = useBridgeContext();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (bridge.status !== "connected") {
      setSkills([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Request initial skill list
    void bridge.request("skills/list").then((res) => {
      const list = res as { skills: Skill[] } | null;
      if (list?.skills) {
        setSkills(list.skills);
      }
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // Subscribe to skill list updates
    const unsubList = bridge.subscribe("SKILL_LIST", (msg: SkillList) => {
      setSkills(msg.skills.map(s => ({ ...s, id: s.name })));
    });

    // Subscribe to individual skill stats
    const unsubStats = bridge.subscribe("SKILL_STATS", (msg: SkillStats) => {
      setSkills(prev => prev.map(s =>
        s.id === msg.skillId
          ? { ...s, loaded: msg.loaded, memoryUsage: msg.memoryUsage, matchCount: msg.matchCount }
          : s
      ));
    });

    // Poll every 15 seconds
    const iv = setInterval(() => {
      void bridge.request("skills/list").then((res) => {
        const list = res as { skills: Skill[] } | null;
        if (list?.skills) {
          setSkills(list.skills);
        }
      }).catch(() => {});
    }, 15000);

    return () => {
      unsubList();
      unsubStats();
      clearInterval(iv);
    };
  }, [bridge]);

  const handleToggleSkill = async (skillId: string, currentlyLoaded: boolean) => {
    try {
      const method = currentlyLoaded ? "skills/unload" : "skills/load";
      await bridge.request(method, { skillId });
    } catch (err) {
      console.error("Failed to toggle skill:", err);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="bg-surface border border-border rounded-skin p-4 h-full">
      <h2 className="text-sm font-semibold text-text mb-3">Skills</h2>

      {loading ? (
        <p className="text-xs text-text-muted">Loading skills...</p>
      ) : skills.length === 0 ? (
        <p className="text-xs text-text-muted">No skills available</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className="flex items-center justify-between p-2 rounded-skin bg-surface-2"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      skill.loaded ? "bg-success" : "bg-border"
                    }`}
                  />
                  <span className="text-sm text-text truncate">{skill.name}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-text-muted">
                  <span>{formatBytes(skill.memoryUsage)}</span>
                  <span>{skill.matchCount} matches</span>
                  <span>tol: {skill.tolerance}</span>
                </div>
              </div>
              <button
                onClick={() => void handleToggleSkill(skill.id, skill.loaded)}
                className={[
                  "ml-2 px-2 py-1 rounded text-xs transition-colors",
                  skill.loaded
                    ? "bg-danger/10 text-danger hover:bg-danger/20"
                    : "bg-success/10 text-success hover:bg-success/20",
                ].join(" ")}
              >
                {skill.loaded ? "Unload" : "Load"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
