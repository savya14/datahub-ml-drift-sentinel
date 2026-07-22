import type { RiskLevel } from "@/lib/types";

const labels: Record<RiskLevel, string> = { low: "low risk", medium: "medium risk", high: "high risk" };

export function RiskBadge({ level, className = "" }: { level: RiskLevel; className?: string }) {
  const cls =
    level === "low"
      ? "text-[var(--risk-low)] bg-[color-mix(in_oklab,var(--risk-low)_13%,transparent)]"
      : level === "medium"
        ? "text-[var(--risk-medium)] bg-[color-mix(in_oklab,var(--risk-medium)_13%,transparent)]"
        : "text-[var(--risk-high)] bg-[color-mix(in_oklab,var(--risk-high)_13%,transparent)]";
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs uppercase tracking-wide ${cls} ${className}`}>
      {labels[level]}
    </span>
  );
}
