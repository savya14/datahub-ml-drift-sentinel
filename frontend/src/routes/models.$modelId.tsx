import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FileText, Radar } from "lucide-react";
import { getModel } from "@/lib/api";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { RiskBadge } from "@/components/RiskBadge";
import { LineageGraph } from "@/components/LineageGraph";
import { DriftTable } from "@/components/DriftTable";
import { RootCauseCallout } from "@/components/RootCauseCallout";
import { WriteBackPanel } from "@/components/WriteBackPanel";
import { AuditLog, type AuditLogLine } from "@/components/AuditLog";
import { IncidentReport } from "@/components/IncidentReport";
import { LineageGraphSkeleton } from "@/components/Skeletons";
import { ErrorState } from "@/components/ErrorState";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { LineageEdge, LineageNode, ModelAudit } from "@/lib/types";

export const Route = createFileRoute("/models/$modelId")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.modelId} — drift audit` },
      {
        name: "description",
        content: `Drift audit for ${params.modelId}.`,
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ModelDetail,
});

// Topological order from source nodes toward the model.
function sweepOrder(nodes: LineageNode[], edges: LineageEdge[]): LineageNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, number>();
  nodes.forEach((n) => incoming.set(n.id, 0));
  edges.forEach((e) => incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1));
  const remaining = new Map(incoming);
  const queue: string[] = [];
  const seen = new Set<string>();
  nodes.forEach((n) => {
    if ((incoming.get(n.id) ?? 0) === 0) queue.push(n.id);
  });
  const out: LineageNode[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (node) out.push(node);
    edges
      .filter((e) => e.source === id)
      .forEach((e) => {
        remaining.set(e.target, (remaining.get(e.target) ?? 1) - 1);
        if ((remaining.get(e.target) ?? 0) <= 0) queue.push(e.target);
      });
  }
  return out;
}

function psiForNode(model: ModelAudit, node: LineageNode): number {
  if (node.nodeType === "table") {
    const relevant = model.featureDrifts.filter((f) => f.sourceTable === node.name);
    if (!relevant.length) return 0;
    return Math.max(...relevant.map((f) => f.psi));
  }
  return Math.max(...model.featureDrifts.map((f) => f.psi));
}

function ModelDetail() {
  const { modelId } = Route.useParams();
  const [model, setModel] = useState<ModelAudit | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    setModel(null);
    setError(null);
    setNotFound(false);
    getModel(modelId)
      .then((m) => {
        if (!m) setNotFound(true);
        else setModel(m);
      })
      .catch((e: Error) => setError(e));
  }, [modelId, nonce]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-8 sm:py-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          back to models
        </Link>

        {error ? (
          <div className="mt-8">
            <ErrorState
              title={`couldn't load ${modelId}`}
              message={error.message}
              onRetry={() => setNonce((n) => n + 1)}
            />
          </div>
        ) : notFound ? (
          <div className="mt-8 font-mono text-sm text-[var(--text-muted)]">
            model not found: {modelId}
          </div>
        ) : !model ? (
          <LoadingDetail />
        ) : (
          <LoadedDetail model={model} />
        )}
      </main>
      <Footer />
    </div>
  );
}

function LoadingDetail() {
  return (
    <div className="mt-6 space-y-6">
      <div className="space-y-2">
        <div className="h-6 w-56 rounded bg-[var(--surface-raised)] animate-pulse" />
        <div className="h-3 w-96 max-w-full rounded bg-[var(--surface-raised)] animate-pulse" />
      </div>
      <LineageGraphSkeleton />
    </div>
  );
}

function LoadedDetail({ model }: { model: ModelAudit }) {
  const lastChecked = new Date(model.lastChecked).toLocaleString();

  const order = useMemo(
    () => sweepOrder(model.lineage.nodes, model.lineage.edges),
    [model.lineage],
  );

  const [auditActive, setAuditActive] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [logLines, setLogLines] = useState<AuditLogLine[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const runAudit = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setAuditActive(true);
    setCheckedIds(new Set());
    setLogLines([]);
    setActiveNodeId(null);

    const total = 3400;
    const step = Math.floor(total / Math.max(order.length, 1));
    const settleDelay = Math.floor(step * 0.55);

    order.forEach((node, i) => {
      const startAt = i * step;
      const psi = psiForNode(model, node);
      const status: "ok" | "flagged" = psi >= 0.1 ? "flagged" : "ok";

      timers.current.push(
        setTimeout(() => {
          setActiveNodeId(node.id);
          setLogLines((prev) => [
            ...prev,
            { nodeId: node.id, nodeName: node.name, psi, status, done: false },
          ]);
        }, startAt),
      );

      timers.current.push(
        setTimeout(() => {
          setCheckedIds((prev) => {
            const next = new Set(prev);
            next.add(node.id);
            return next;
          });
          setLogLines((prev) =>
            prev.map((l) => (l.nodeId === node.id ? { ...l, done: true } : l)),
          );
        }, startAt + settleDelay),
      );
    });

    timers.current.push(
      setTimeout(() => {
        setActiveNodeId(null);
        setAuditActive(false);
        setHasRun(true);
      }, order.length * step + 100),
    );
  }, [order, model]);

  return (
    <>
      <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-mono text-xl sm:text-2xl text-[var(--text-primary)] break-all">
              {model.modelName}
            </h1>
            <RiskBadge level={model.overallRisk} />
          </div>
          <div className="mt-1 font-mono text-[11px] text-[var(--text-muted)] break-all">
            {model.modelUrn}
          </div>
          <div className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
            last checked {lastChecked}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Sheet open={reportOpen} onOpenChange={setReportOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-raised)] px-3.5 py-2 font-sans text-sm text-[var(--text-primary)] transition-colors"
              >
                <FileText className="h-4 w-4 text-[var(--text-secondary)]" />
                Incident report
              </button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-full sm:max-w-lg overflow-y-auto bg-[var(--surface)] border-l border-[var(--border)]"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Incident report for {model.modelName}</SheetTitle>
                <SheetDescription>
                  Full drift audit report with per-feature breakdown and recommended action.
                </SheetDescription>
              </SheetHeader>
              <IncidentReport model={model} />
            </SheetContent>
          </Sheet>

          <button
            type="button"
            onClick={runAudit}
            disabled={auditActive}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-raised)] disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2 font-sans text-sm text-[var(--text-primary)] transition-colors"
          >
            <Radar
              className="h-4 w-4 text-[var(--primary)]"
              style={{
                animation: auditActive ? "spin 1.5s linear infinite" : "none",
              }}
            />
            {auditActive ? "Auditing..." : "Run audit"}
          </button>
        </div>
      </div>

      <section className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <div>
            <div className="mb-3 flex items-baseline justify-between gap-2 flex-wrap">
              <h2 className="font-mono text-sm uppercase tracking-wide text-[var(--text-secondary)]">
                lineage
              </h2>
              <span className="font-mono text-[11px] text-[var(--text-muted)]">
                {model.lineage.nodes.length} nodes ·{" "}
                {model.lineage.edges.length} edges
              </span>
            </div>
            <LineageGraph
              nodes={model.lineage.nodes}
              edges={model.lineage.edges}
              auditActive={auditActive}
              activeNodeId={activeNodeId}
              checkedNodeIds={checkedIds}
            />
          </div>

          <AuditLog lines={logLines} active={auditActive} />

          <div
            style={{
              transition: "opacity 300ms ease",
              opacity: auditActive ? 0.5 : 1,
            }}
          >
            <h2 className="mb-3 font-mono text-sm uppercase tracking-wide text-[var(--text-secondary)]">
              statistical evidence breakdown
              {hasRun && (
                <span className="ml-2 font-mono text-[10px] normal-case tracking-normal text-[var(--accent)]">
                  updated
                </span>
              )}
            </h2>
            <DriftTable features={model.featureDrifts} />
          </div>
        </div>

        <div className="space-y-6 min-w-0">
          <RootCauseCallout model={model} />
          <WriteBackPanel model={model} />
        </div>
      </section>
    </>
  );
}
