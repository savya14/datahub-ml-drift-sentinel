import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ModelAudit } from "@/lib/types";

export function RootCauseCallout({ model }: { model: ModelAudit }) {
  const isClear = model.overallRisk === "low";
  const color = isClear ? "var(--risk-low)" : model.overallRisk === "high" ? "var(--risk-high)" : "var(--risk-medium)";
  const Icon = isClear ? CheckCircle2 : AlertTriangle;
  return (
    <div
      className="rounded-xl border p-4 flex gap-3"
      style={{
        borderColor: color,
        background: `color-mix(in oklab, ${color} 8%, transparent)`,
      }}
    >
      <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color }} />
      <div>
        <div
          className="font-mono text-[11px] uppercase tracking-wide mb-1"
          style={{ color }}
        >
          root cause
        </div>
        <p className="font-sans text-sm text-[var(--text-primary)] leading-relaxed">
          {model.rootCause}
        </p>
      </div>
    </div>
  );
}
