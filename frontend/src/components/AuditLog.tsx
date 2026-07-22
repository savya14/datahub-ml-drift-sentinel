import { useEffect, useRef } from "react";

export interface AuditLogLine {
  nodeId: string;
  nodeName: string;
  psi: number;
  status: "ok" | "flagged";
  done: boolean;
}

export function AuditLog({
  lines,
  active,
}: {
  lines: AuditLogLine[];
  active: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines.length]);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="px-4 py-2 border-b border-[var(--border)] flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
          audit log
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-muted)]">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              background: active ? "var(--accent)" : "var(--text-muted)",
              animation: active ? "pulse 1s ease-in-out infinite" : "none",
            }}
          />
          {active ? "scanning" : lines.length ? "idle" : "waiting"}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="h-[180px] overflow-y-auto px-4 py-3 font-mono text-[12px] leading-relaxed"
      >
        {lines.length === 0 ? (
          <div className="text-[var(--text-muted)]">
            click "Run audit" to sweep the lineage graph.
          </div>
        ) : (
          lines.map((l, i) => (
            <div key={i} className="text-[var(--text-secondary)]">
              <span className="text-[var(--text-muted)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              {"  "}
              checking {l.nodeName}...{" "}
              {l.done ? (
                <>
                  psi {l.psi.toFixed(2)}
                  {" - "}
                  <span
                    style={{
                      color:
                        l.status === "flagged"
                          ? "var(--risk-high)"
                          : "var(--risk-low)",
                    }}
                  >
                    {l.status}
                  </span>
                </>
              ) : (
                <span className="text-[var(--accent)]">scanning</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
