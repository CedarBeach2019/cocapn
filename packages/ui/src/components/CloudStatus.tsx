import { useState, useEffect } from "react";
import { useBridgeContext } from "@/contexts/BridgeContext.js";
import type { CloudStatus as CloudStatusMsg } from "@/types/bridge.js";

export function CloudStatus() {
  const bridge = useBridgeContext();
  const [status, setStatus] = useState<CloudStatusMsg | null>(null);

  useEffect(() => {
    if (bridge.status !== "connected") {
      setStatus(null);
      return;
    }

    // Request initial status
    void bridge.request("cloud/status").then((res) => {
      setStatus(res as CloudStatusMsg | null);
    }).catch(() => {
      setStatus(null);
    });

    // Subscribe to status updates
    const unsub = bridge.subscribe("CLOUD_STATUS", (msg: CloudStatusMsg) => {
      setStatus(msg);
    });

    // Poll every 10 seconds
    const iv = setInterval(() => {
      void bridge.request("cloud/status").then((res) => {
        setStatus(res as CloudStatusMsg | null);
      }).catch(() => {});
    }, 10000);

    return () => {
      unsub();
      clearInterval(iv);
    };
  }, [bridge]);

  const healthColor: Record<string, string> = {
    healthy: "text-success",
    degraded: "text-accent",
    down: "text-danger",
  };

  return (
    <div className="bg-surface border border-border rounded-skin p-4">
      <h2 className="text-sm font-semibold text-text mb-3">Cloud Connection</h2>

      {!status ? (
        <p className="text-xs text-text-muted">No cloud connection</p>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-text-muted">Status:</span>
            <span className={status.connected ? "text-success" : "text-danger"}>
              {status.connected ? "Connected" : "Disconnected"}
            </span>
          </div>

          {status.connected && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Health:</span>
                <span className={healthColor[status.workerHealth]}>
                  {status.workerHealth}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-text-muted">Latency:</span>
                <span className="text-text">{status.latency}ms</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-text-muted">Tasks:</span>
                <span className="text-text">
                  {status.tasksQueued} queued / {status.tasksCompleted} completed
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-text-muted">Last heartbeat:</span>
                <span className="text-text">
                  {new Date(status.lastHeartbeat).toLocaleTimeString()}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
