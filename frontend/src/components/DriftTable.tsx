import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from "recharts";
import type { FeatureDrift } from "@/lib/types";
import { RiskBadge } from "./RiskBadge";

function MiniDist({ feature }: { feature: FeatureDrift }) {
  const data = feature.baselineDistribution.map((b, i) => ({
    bin: String(i + 1),
    baseline: b,
    current: feature.currentDistribution[i] ?? 0,
  }));
  return (
    <div className="h-10 w-32">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={1} barCategoryGap={2}>
          <XAxis dataKey="bin" hide />
          <Tooltip
            cursor={{ fill: "var(--surface-raised)" }}
            contentStyle={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: "var(--text-primary)",
            }}
            labelStyle={{ color: "var(--text-muted)" }}
          />
          <Bar dataKey="baseline" fill="var(--text-muted)" radius={1} />
          <Bar dataKey="current" fill="var(--primary)" radius={1} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const num = (n: number, d = 2) => n.toFixed(d);

export function DriftTable({ features }: { features: FeatureDrift[] }) {
  const sorted = [...features].sort((a, b) => b.psi - a.psi);
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              <th className="px-4 py-3 font-normal">feature</th>
              <th className="px-4 py-3 font-normal">type</th>
              <th className="px-4 py-3 font-normal">psi</th>
              <th className="px-4 py-3 font-normal">ks d</th>
              <th className="px-4 py-3 font-normal">ks p</th>
              <th className="px-4 py-3 font-normal">null rate</th>
              <th className="px-4 py-3 font-normal">risk</th>
              <th className="px-4 py-3 font-normal">recommendation</th>
              <th className="px-4 py-3 font-normal">baseline vs current</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((f) => (
              <tr
                key={f.featureName}
                className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-raised)] transition-colors"
              >
                <td className="px-4 py-3 font-mono text-[13px] text-[var(--text-primary)]">
                  {f.featureName}
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    from {f.sourceTable}
                  </div>
                </td>
                <td className="px-4 py-3 font-sans text-xs text-[var(--text-secondary)]">
                  {f.featureType}
                </td>
                <td className="px-4 py-3 font-mono text-[13px] text-[var(--text-primary)]">
                  {num(f.psi)}
                </td>
                <td className="px-4 py-3 font-mono text-[12px] text-[var(--text-secondary)]">
                  {f.ksStatistic != null ? num(f.ksStatistic) : "—"}
                </td>
                <td className="px-4 py-3 font-mono text-[12px] text-[var(--text-secondary)]">
                  {f.ksPValue != null ? num(f.ksPValue, 3) : "—"}
                </td>
                <td className="px-4 py-3 font-mono text-[12px] text-[var(--text-secondary)]">
                  {f.nullRate != null ? `${num(f.nullRate * 100, 1)}%` : "—"}
                </td>
                <td className="px-4 py-3">
                  <RiskBadge level={f.riskLevel} />
                </td>
                <td className="px-4 py-3 font-sans text-xs text-[var(--text-secondary)] max-w-[200px] truncate" title={f.recommendation || "—"}>
                  {f.recommendation || "—"}
                </td>
                <td className="px-4 py-3">
                  <MiniDist feature={f} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
