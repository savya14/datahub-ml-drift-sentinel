import type { ModelAudit } from "@/lib/types";
import { RiskBadge } from "./RiskBadge";

// The full incident report. The write-back panel's `incidentReportPreview`
// is an excerpt of this same document — same content, shorter form.

function recommendedAction(model: ModelAudit): string {
  if (model.overallRisk === "low") {
    return "No action required. Continue monitoring on the standard schedule.";
  }
  const flagged = model.featureDrifts
    .filter((f) => f.riskLevel !== "low")
    .sort((a, b) => b.psi - a.psi);
  const top = flagged[0];
  if (!top) return "Investigate flagged upstream tables and re-baseline if the shift is expected.";
  if (model.overallRisk === "high") {
    return `Investigate ${top.sourceTable} for the source of the ${top.featureName} shift. If the drift is expected (e.g. an intentional product change), re-baseline the feature. Otherwise, consider retraining ${model.modelName} on a recent window before the drift compounds into a business-metric regression.`;
  }
  return `Watch ${top.featureName} on the next audit cycle. If PSI keeps climbing above 0.25, escalate to a retraining decision; if it stabilizes, re-baseline against the current window.`;
}

export function IncidentReport({ model }: { model: ModelAudit }) {
  const flagged = model.featureDrifts
    .filter((f) => f.riskLevel !== "low")
    .sort((a, b) => b.psi - a.psi);
  const stableCount = model.featureDrifts.length - flagged.length;
  const generated = new Date(model.lastChecked).toLocaleString();

  return (
    <div className="font-sans text-sm text-[var(--text-primary)] leading-relaxed">
      <header className="pb-4 mb-5 border-b border-[var(--border)]">
        <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
          governance incident audit trail
        </div>
        <h2 className="mt-1 font-mono text-lg text-[var(--text-primary)]">
          {model.modelName}
        </h2>
        <div className="mt-1 font-mono text-[11px] text-[var(--text-muted)] break-all">
          {model.modelUrn}
        </div>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <RiskBadge level={model.overallRisk} />
          <span className="font-mono text-[11px] text-[var(--text-muted)]">
            generated {generated}
          </span>
        </div>
      </header>

      <section className="mb-6">
        <h3 className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)] mb-2">
          executive summary
        </h3>
        <p className="text-[var(--text-primary)]">{model.rootCause}</p>
        <p className="mt-2 text-[var(--text-secondary)] text-[13px]">
          {flagged.length === 0
            ? `All ${model.featureDrifts.length} monitored features are within PSI thresholds (< 0.10).`
            : `${flagged.length} of ${model.featureDrifts.length} features exceeded the PSI 0.10 threshold. ${stableCount} remain stable.`}
        </p>
      </section>

      <section className="mb-6">
        <h3 className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)] mb-2">
          verifiable evidence trail
        </h3>
        {flagged.length === 0 ? (
          <p className="text-[var(--text-secondary)] text-[13px]">
            No features flagged. See the evidence table for full PSI values.
          </p>
        ) : (
          <ul className="space-y-3">
            {flagged.map((f) => (
              <li
                key={f.featureName}
                className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-3"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="font-mono text-[13px] text-[var(--text-primary)]">
                    {f.featureName}
                  </div>
                  <RiskBadge level={f.riskLevel} />
                </div>
                <div className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
                  from {f.sourceTable} · {f.featureType}
                </div>
                <div className="mt-2 font-mono text-[12px] text-[var(--text-secondary)]">
                  psi {f.psi.toFixed(2)}
                  {f.ksStatistic != null && (
                    <> · ks d {f.ksStatistic.toFixed(2)}</>
                  )}
                  {f.ksPValue != null && (
                    <> · ks p {f.ksPValue.toFixed(3)}</>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)] mb-2">
          recommended governance action
        </h3>
        <p className="text-[var(--text-primary)]">{recommendedAction(model)}</p>
      </section>
    </div>
  );
}
