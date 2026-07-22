import { AlertOctagon, RotateCw } from "lucide-react";

export function ErrorState({
  title = "couldn't load data",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  const isSimulated =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("fail") === "1";

  const clearSim = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("fail");
    window.location.href = url.toString();
  };

  return (
    <div
      className="rounded-xl border p-6 flex gap-4"
      style={{
        borderColor: "var(--risk-high)",
        background: "color-mix(in oklab, var(--risk-high) 8%, transparent)",
      }}
    >
      <AlertOctagon
        className="h-5 w-5 mt-0.5 flex-shrink-0"
        style={{ color: "var(--risk-high)" }}
      />
      <div className="min-w-0 flex-1">
        <div
          className="font-mono text-[11px] uppercase tracking-wide mb-1"
          style={{ color: "var(--risk-high)" }}
        >
          error
        </div>
        <h3 className="font-mono text-sm text-[var(--text-primary)]">{title}</h3>
        {message && (
          <p className="mt-1 font-sans text-xs text-[var(--text-secondary)] leading-relaxed break-words">
            {message}
          </p>
        )}
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-raised)] px-3 py-1.5 font-sans text-xs text-[var(--text-primary)] transition-colors"
            >
              <RotateCw className="h-3 w-3" />
              try again
            </button>
          )}
          {isSimulated && (
            <button
              type="button"
              onClick={clearSim}
              className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              dev: clear ?fail=1
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
