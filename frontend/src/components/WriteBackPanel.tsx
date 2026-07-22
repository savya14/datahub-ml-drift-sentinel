import { useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Upload, Eye, X, Send } from "lucide-react";
import type { ModelAudit, WriteBackState } from "@/lib/types";
import { writebackModel } from "@/lib/api";

export function WriteBackPanel({ model }: { model: ModelAudit }) {
  const [wb, setWb] = useState<WriteBackState>(model.writeBack);

  const isReviewing = wb.status === "review";
  const written = wb.status === "written";
  const writing = wb.status === "writing";

  const topFeature = model.featureDrifts.length > 0 
    ? [...model.featureDrifts].sort((a,b) => b.psi - a.psi)[0].featureName 
    : "";

  const driftedFeaturesCount = model.featureDrifts.filter(f => f.riskLevel !== "low").length;
  const upstreamDatasetCount = model.lineage.nodes.filter(n => n.nodeType !== "model").length;

  const handleStartReview = () => {
    setWb({ status: "review" });
  };

  const handleCancelReview = () => {
    setWb({ status: "not_started" });
  };

  const handleConfirmWrite = async () => {
    if (writing) return;
    setWb((prev) => ({ ...prev, status: "writing" }));
    try {
      const payload = {
        model_urn: model.modelUrn,
        timestamp: model.lastChecked,
        feature_results: model.featureDrifts.map(f => ({
          feature_name: f.featureName,
          source_entity_urn: f.sourceTable,
          psi: f.psi,
          ks_pvalue: f.ksPValue,
          risk_level: f.riskLevel.toUpperCase(),
          baseline_distribution: f.baselineDistribution,
          current_distribution: f.currentDistribution,
          null_rate: f.nullRate,
          recommendation: f.recommendation
        })),
        overall_risk: model.overallRisk.toUpperCase(),
        top_contributing_feature: topFeature,
        upstream_entities: model.lineage.nodes.filter(n => n.nodeType !== "model").map(n => n.id)
      };

      await writebackModel(model.modelUrn, payload);

      setWb({ 
        status: "written",
        structuredProperties: {
           "Drift Risk": model.overallRisk.toUpperCase(),
           "Features Drifted": driftedFeaturesCount,
           "Upstream Datasets Tagged": upstreamDatasetCount
        },
        incidentReportPreview: `Drift incident report generated for ${model.modelName}. Overall risk: ${model.overallRisk.toUpperCase()}. Top feature: ${topFeature}.`,
        entityUrl: `${import.meta.env.VITE_DATAHUB_URL || "http://localhost:9002"}/model/${encodeURIComponent(model.modelUrn)}`
      });
    } catch (e) {
      console.error(e);
      setWb({ status: "not_started" });
    }
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-mono text-sm uppercase tracking-wide text-[var(--text-secondary)]">
            datahub active governance write-back
          </h3>
          <p className="mt-1 font-sans text-xs text-[var(--text-muted)] max-w-md">
            Publishes verifiable drift audit evidence and incident reports directly to DataHub's metadata graph as the system of record.
          </p>
        </div>

        {!isReviewing && !written && !writing && (
          <button
            type="button"
            onClick={handleStartReview}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] hover:bg-[var(--surface-raised)] px-3.5 py-2 font-sans text-sm text-[var(--text-primary)] transition-colors"
          >
            <Eye className="h-4 w-4 text-[var(--primary)]" />
            Write to DataHub
          </button>
        )}

        {written && (
          <button
            type="button"
            onClick={handleStartReview}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] hover:bg-[var(--surface-raised)] px-3.5 py-2 font-sans text-sm text-[var(--text-primary)] transition-colors"
          >
            <Upload className="h-4 w-4 text-[var(--primary)]" />
            Re-write to DataHub
          </button>
        )}
      </div>

      {!written && !writing && !isReviewing && (
        <div className="mt-4 rounded-lg border border-dashed border-[var(--border)] bg-[var(--canvas)] px-3 py-2 font-mono text-[11px] text-[var(--text-muted)]">
          not yet written. click "Write to DataHub" to review and publish governance audit evidence.
        </div>
      )}

      {/* STEP 1: REVIEW PANEL */}
      {isReviewing && (
        <div className="mt-4 space-y-4 rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-4">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
            <div className="font-mono text-xs uppercase tracking-wide text-[var(--text-secondary)] flex items-center gap-2">
              <Eye className="h-4 w-4 text-[var(--accent)]" />
              Review DataHub Governance Evidence Payload
            </div>
            <button 
              type="button" 
              onClick={handleCancelReview}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title="Cancel Review"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Structured Properties to be published */}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-2">
              1. Structured Properties Evidence to Emit
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs space-y-2 font-mono">
              <div className="flex justify-between py-1 border-b border-[var(--border)]">
                <span className="text-[var(--text-secondary)]">Overall Risk Level:</span>
                <span className="font-bold text-[var(--text-primary)]">{model.overallRisk.toUpperCase()}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--border)]">
                <span className="text-[var(--text-secondary)]">Drifted Features Count:</span>
                <span className="text-[var(--text-primary)]">{driftedFeaturesCount} of {model.featureDrifts.length}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[var(--text-secondary)]">Upstream Datasets Tagged:</span>
                <span className="text-[var(--text-primary)]">{upstreamDatasetCount} dataset(s)</span>
              </div>
            </div>
          </div>

          {/* Feature Breakdown Table Preview */}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-2">
              Statistical Evidence Payload ({model.featureDrifts.length} features)
            </div>
            <div className="max-h-36 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[var(--surface-raised)] text-[10px] uppercase text-[var(--text-muted)] border-b border-[var(--border)]">
                  <tr>
                    <th className="p-2">Feature</th>
                    <th className="p-2 font-semibold">PSI</th>
                    <th className="p-2">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] text-[11px]">
                  {model.featureDrifts.map((f) => (
                    <tr key={f.featureName}>
                      <td className="p-2 text-[var(--text-primary)]">{f.featureName}</td>
                      <td className="p-2 text-[var(--text-secondary)]">{f.psi.toFixed(4)}</td>
                      <td className="p-2 font-semibold text-[var(--text-primary)]">{f.riskLevel.toUpperCase()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Incident Report Preview */}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-2">
              2. Governance Incident Audit Trail Document
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 font-sans text-xs text-[var(--text-secondary)] leading-relaxed">
              <p className="font-semibold text-[var(--text-primary)] mb-1 font-mono">
                Drift Governance Audit Trail — {model.modelName}
              </p>
              <p>
                Automated drift audit established <strong>{model.overallRisk.toUpperCase()}</strong> risk evidence. Top contributing feature: <strong>{topFeature}</strong>. Document linked directly to model URN as verifiable governance history.
              </p>
            </div>
          </div>

          {/* Step 1 Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleCancelReview}
              className="px-3 py-1.5 font-sans text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmWrite}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 font-sans text-xs rounded-md bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-medium transition-colors shadow-sm"
            >
              <Send className="h-3.5 w-3.5" />
              Confirm & Write to DataHub
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: WRITING STATE */}
      {writing && (
        <div className="mt-4 flex items-center gap-2 font-mono text-xs text-[var(--accent)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          writing structured properties and incident report...
        </div>
      )}

      {/* STEP 3: WRITTEN STATE */}
      {written && (
        <div className="mt-5 space-y-4">
          <div className="flex items-center gap-2 font-mono text-xs text-[var(--risk-low)]">
            <CheckCircle2 className="h-4 w-4" />
            written to datahub
          </div>

          {wb.structuredProperties && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-2">
                structured properties
              </div>
              <dl className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] divide-y divide-[var(--border)]">
                {Object.entries(wb.structuredProperties).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between px-3 py-2 gap-4">
                    <dt className="font-mono text-[11px] text-[var(--text-secondary)]">
                      {k}
                    </dt>
                    <dd className="font-mono text-[12px] text-[var(--text-primary)] break-all text-right">
                      {String(v)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {wb.incidentReportPreview && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)] mb-2">
                incident report preview
              </div>
              <p className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-3 font-sans text-xs text-[var(--text-secondary)] leading-relaxed">
                {wb.incidentReportPreview}
              </p>
            </div>
          )}

          {wb.entityUrl && (
            <a
              href={wb.entityUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-xs text-[var(--accent)] hover:underline"
            >
              View in DataHub
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

