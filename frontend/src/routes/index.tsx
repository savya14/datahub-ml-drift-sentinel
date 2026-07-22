import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { listModels } from "@/lib/api";
import type { ModelAudit } from "@/lib/types";
import { RiskBadge } from "@/components/RiskBadge";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ModelCardSkeleton } from "@/components/Skeletons";
import { ErrorState } from "@/components/ErrorState";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DataHub ML Drift Sentinel — monitored models" },
      {
        name: "description",
        content:
          "Overview of monitored production ML models with current drift risk based on PSI and KS tests across upstream features.",
      },
    ],
  }),
  component: Dashboard,
});

function summaryFor(m: ModelAudit): string {
  if (m.featureDrifts.length === 0) {
    return "Not yet audited.";
  }
  const drifted = m.featureDrifts.filter((f) => f.riskLevel !== "low");
  if (drifted.length === 0) {
    return `No drift detected across ${m.featureDrifts.length} monitored features.`;
  }
  const top = [...drifted].sort((a, b) => b.psi - a.psi)[0];
  return `${drifted.length} of ${m.featureDrifts.length} features drifted. Top: ${top.featureName} (PSI ${top.psi.toFixed(2)}, from ${top.sourceTable}).`;
}

function relTime(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  return `${h}h ago`;
}

function Dashboard() {
  const [models, setModels] = useState<ModelAudit[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(() => {
    setModels(null);
    setError(null);
    listModels()
      .then(setModels)
      .catch((e: Error) => setError(e));
  }, []);

  useEffect(() => {
    load();
  }, [load, nonce]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-8 sm:py-10">
        <div className="mb-8">
          <h1 className="font-mono text-xl sm:text-2xl text-[var(--text-primary)]">monitored models</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-2xl">
            Production ML models monitored by DataHub Sentinel. Risk and evidence trails are computed from PSI & KS tests on upstream features and written back directly into DataHub's metadata graph as active governance evidence.
          </p>
        </div>

        {error ? (
          <ErrorState
            title="couldn't load the model list"
            message={error.message}
            onRetry={() => setNonce((n) => n + 1)}
          />
        ) : !models ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <ModelCardSkeleton key={i} />
            ))}
          </div>
        ) : models.length === 0 ? (
          <div className="rounded-xl border border-border border-dashed p-12 text-center">
            <h3 className="font-mono text-sm text-[var(--text-primary)]">No models registered</h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">No models registered in DataHub yet.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {models.map((m) => {
              const isAudited = m.featureDrifts.length > 0;
              return (
                <Link
                  key={m.modelId}
                  to="/models/$modelId"
                  params={{ modelId: m.modelId }}
                  className="group min-w-0 flex flex-col overflow-hidden rounded-xl border border-border bg-[var(--surface)] p-5 transition-colors hover:border-[var(--surface-raised)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-mono text-sm text-[var(--text-primary)] min-w-0 truncate">{m.modelName}</div>
                    {isAudited ? (
                      <RiskBadge level={m.overallRisk} />
                    ) : (
                      <span className="inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs uppercase tracking-wide text-[var(--text-secondary)] bg-[var(--surface-raised)] whitespace-nowrap">
                        Not audited
                      </span>
                    )}
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-[var(--text-muted)] truncate">{m.modelUrn}</div>
                  
                  {isAudited ? (
                    <>
                      <p className="mt-4 flex-1 text-sm text-[var(--text-secondary)] leading-relaxed">
                        {summaryFor(m)}
                      </p>
                      <div className="mt-6 flex items-center justify-between">
                        <span className="font-mono text-[11px] text-[var(--text-muted)]">
                          last checked {relTime(m.lastChecked)}
                        </span>
                        <ArrowRight className="h-4 w-4 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--text-primary)]" />
                      </div>
                    </>
                  ) : (
                    <div className="mt-6 flex-1 flex flex-col items-center justify-center">
                      <div className="w-full text-center rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--surface)] transition-colors hover:opacity-90">
                        Run Audit
                      </div>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
