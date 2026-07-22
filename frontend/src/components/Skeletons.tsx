export function ModelCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-[var(--surface)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="h-4 w-32 rounded bg-[var(--surface-raised)] animate-pulse" />
        <div className="h-5 w-14 rounded bg-[var(--surface-raised)] animate-pulse" />
      </div>
      <div className="mt-2 h-3 w-48 rounded bg-[var(--surface-raised)] animate-pulse" />
      <div className="mt-5 space-y-2">
        <div className="h-3 w-full rounded bg-[var(--surface-raised)] animate-pulse" />
        <div className="h-3 w-3/4 rounded bg-[var(--surface-raised)] animate-pulse" />
      </div>
      <div className="mt-6 h-3 w-24 rounded bg-[var(--surface-raised)] animate-pulse" />
    </div>
  );
}

export function LineageGraphSkeleton() {
  return (
    <div className="h-[420px] w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-around">
        {[0, 1, 2].map((col) => (
          <div key={col} className="flex flex-col gap-4">
            {Array.from({ length: col === 1 ? 1 : 2 }).map((_, i) => (
              <div
                key={i}
                className="h-14 w-40 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] animate-pulse"
              />
            ))}
          </div>
        ))}
      </div>
      <div className="absolute bottom-3 left-4 font-mono text-[11px] text-[var(--text-muted)]">
        loading lineage…
      </div>
    </div>
  );
}
