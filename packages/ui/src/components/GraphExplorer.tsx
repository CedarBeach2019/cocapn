import { useState, useEffect } from "react";
import { useBridgeContext } from "@/contexts/BridgeContext.js";
import type { GraphQuery } from "@/types/bridge.js";

interface GraphNode {
  id: string;
  label: string;
  type: string;
  connections: number;
}

interface GraphEdge {
  from: string;
  to: string;
  type: string;
}

export function GraphExplorer() {
  const bridge = useBridgeContext();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (bridge.status !== "connected") {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Request initial graph data
    void bridge.request("graph/query", { limit: 10 }).then((res) => {
      const result = res as { nodes: GraphNode[]; edges: GraphEdge[] } | null;
      if (result) {
        setNodes(result.nodes);
        setEdges(result.edges);
      }
    }).catch(() => {});

    // Subscribe to updates
    const unsub = bridge.subscribe("GRAPH_QUERY", (msg: GraphQuery) => {
      setNodes(msg.result.nodes);
      setEdges(msg.result.edges);
    });

    return () => unsub();
  }, [bridge]);

  const handleNodeClick = async (nodeId: string) => {
    try {
      const result = await bridge.request("graph/dependents", { nodeId }) as {
        nodes: GraphNode[];
        edges: GraphEdge[];
      } | null;
      if (result) {
        setNodes(result.nodes);
        setEdges(result.edges);
        const node = result.nodes.find(n => n.id === nodeId);
        if (node) setSelectedNode(node);
      }
    } catch (err) {
      console.error("Failed to load node dependents:", err);
    }
  };

  const filteredNodes = nodes.filter(node =>
    node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    node.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedNodes = [...filteredNodes].sort((a, b) => b.connections - a.connections);
  const maxConnections = Math.max(...nodes.map(n => n.connections), 1);

  return (
    <div className="bg-surface border border-border rounded-skin p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-text">Knowledge Graph</h2>
        <span className="text-xs text-text-muted">
          {nodes.length} nodes, {edges.length} edges
        </span>
      </div>

      {/* Search */}
      <div className="mb-3">
        <input
          type="text"
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 bg-surface-2 border border-border rounded-skin text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-primary/60 transition-colors"
        />
      </div>

      {/* Node list */}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {sortedNodes.length === 0 ? (
          <p className="text-xs text-text-muted">No nodes found</p>
        ) : (
          sortedNodes.map((node) => (
            <button
              key={node.id}
              onClick={() => void handleNodeClick(node.id)}
              className={[
                "w-full flex items-center justify-between p-2 rounded-skin text-left transition-colors",
                selectedNode?.id === node.id
                  ? "bg-primary/10 border border-primary/30"
                  : "bg-surface-2 hover:bg-surface-3",
              ].join(" ")}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase text-text-muted bg-surface px-1 rounded">
                    {node.type}
                  </span>
                  <span className="text-sm text-text truncate">{node.label}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-1 bg-surface-3 rounded overflow-hidden flex-1 max-w-24">
                    <div
                      className="h-full bg-accent rounded"
                      style={{ width: `${(node.connections / maxConnections) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-text-muted">
                    {node.connections} conn
                  </span>
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Selected node details */}
      {selectedNode && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs font-semibold text-text mb-1">Selected: {selectedNode.label}</p>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-text-muted">
            <span>Type: {selectedNode.type}</span>
            <span>Connections: {selectedNode.connections}</span>
          </div>
        </div>
      )}
    </div>
  );
}
