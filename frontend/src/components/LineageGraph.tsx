import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Position,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { LineageEdge, LineageNode, RiskLevel } from "@/lib/types";

const riskVar = (level?: RiskLevel) =>
  level === "high"
    ? "var(--risk-high)"
    : level === "medium"
      ? "var(--risk-medium)"
      : level === "low"
        ? "var(--risk-low)"
        : "var(--border)";

const typeLabel: Record<LineageNode["nodeType"], string> = {
  table: "table",
  feature_table: "feature table",
  model: "model",
};

function layout(nodes: LineageNode[], edges: LineageEdge[]) {
  const incoming = new Map<string, number>();
  nodes.forEach((n) => incoming.set(n.id, 0));
  edges.forEach((e) => incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1));

  const depth = new Map<string, number>();
  const queue: string[] = [];
  nodes.forEach((n) => {
    if ((incoming.get(n.id) ?? 0) === 0) {
      depth.set(n.id, 0);
      queue.push(n.id);
    }
  });
  const remaining = new Map(incoming);
  while (queue.length) {
    const id = queue.shift()!;
    const d = depth.get(id) ?? 0;
    edges
      .filter((e) => e.source === id)
      .forEach((e) => {
        depth.set(e.target, Math.max(depth.get(e.target) ?? 0, d + 1));
        remaining.set(e.target, (remaining.get(e.target) ?? 0) - 1);
        if ((remaining.get(e.target) ?? 0) <= 0) queue.push(e.target);
      });
  }

  const cols = new Map<number, string[]>();
  nodes.forEach((n) => {
    const d = depth.get(n.id) ?? 0;
    if (!cols.has(d)) cols.set(d, []);
    cols.get(d)!.push(n.id);
  });

  const colGap = 260;
  const rowGap = 110;
  const positions = new Map<string, { x: number; y: number }>();
  [...cols.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([d, ids]) => {
      const totalH = (ids.length - 1) * rowGap;
      ids.forEach((id, i) => {
        positions.set(id, { x: d * colGap, y: i * rowGap - totalH / 2 });
      });
    });
  return positions;
}

export function LineageGraph({
  nodes,
  edges,
  auditActive = false,
  activeNodeId,
  checkedNodeIds,
}: {
  nodes: LineageNode[];
  edges: LineageEdge[];
  auditActive?: boolean;
  activeNodeId?: string | null;
  checkedNodeIds?: Set<string>;
}) {
  const checked = checkedNodeIds ?? new Set<string>();

  const rfNodes: Node[] = useMemo(() => {
    const pos = layout(nodes, edges);
    return nodes.map((n) => {
      const isActive = activeNodeId === n.id;
      const isChecked = checked.has(n.id);
      let borderColor = riskVar(n.riskLevel);
      if (auditActive && !isChecked && !isActive) borderColor = "var(--border)";
      if (isActive) borderColor = "var(--accent)";
      return {
        id: n.id,
        position: pos.get(n.id) ?? { x: 0, y: 0 },
        type: "default",
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          label: (
            <div className="text-left">
              <div className="font-mono text-[12px] text-[var(--text-primary)]">
                {n.name}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)] mt-0.5">
                {typeLabel[n.nodeType]}
              </div>
            </div>
          ),
        },
        style: {
          background: "var(--surface)",
          color: "var(--text-primary)",
          border: `1px solid ${borderColor}`,
          borderRadius: 12,
          padding: "10px 14px",
          fontFamily:
            "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12,
          minWidth: 180,
          boxShadow: isActive
            ? "0 0 0 3px color-mix(in oklab, var(--accent) 25%, transparent)"
            : "none",
          transition: "border-color 200ms ease, box-shadow 200ms ease",
        },
      };
    });
  }, [nodes, edges, activeNodeId, checked, auditActive]);

  const rfEdges: Edge[] = useMemo(
    () =>
      edges.map((e, i) => {
        const targetActive = activeNodeId === e.target;
        const targetChecked = checked.has(e.target);
        const sourceChecked = checked.has(e.source) || checked.has(e.target);
        const stroke = targetActive
          ? "var(--accent)"
          : targetChecked || sourceChecked
            ? "var(--text-muted)"
            : "var(--border)";
        return {
          id: `${e.source}->${e.target}-${i}`,
          source: e.source,
          target: e.target,
          animated: targetActive,
          style: {
            stroke,
            strokeWidth: targetActive ? 2 : 1,
            transition: "stroke 200ms ease",
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
        };
      }),
    [edges, activeNodeId, checked],
  );

  return (
    <div className="h-[420px] w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll={false}
      >
        <Background color="var(--border)" gap={20} size={1} />
        <Controls
          showInteractive={false}
          className="!bg-[var(--surface-raised)] !border-[var(--border)]"
        />
      </ReactFlow>
    </div>
  );
}
