import { Link } from "@tanstack/react-router";
import { useTheme } from "@/lib/theme";
import { Radar } from "lucide-react";

export function Header() {
  const { theme, toggle } = useTheme();
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 py-4">
        <Link to="/" className="flex items-center gap-2 font-mono text-xs sm:text-sm text-[var(--text-primary)] min-w-0">
          <Radar className="h-4 w-4 text-[var(--brand)] flex-shrink-0" />
          <span className="truncate">datahub_ml_drift_sentinel</span>
          <span className="hidden sm:inline-block ml-2 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            synthetic data
          </span>
        </Link>
        <button
          type="button"
          onClick={toggle}
          className="relative inline-flex h-7 w-16 flex-shrink-0 items-center rounded-full border border-border bg-[var(--surface)] font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)] transition-colors"
          aria-label="Toggle theme"
        >
          <span className={`absolute top-0.5 h-6 w-7 rounded-full bg-[var(--surface-raised)] transition-all ${theme === "dark" ? "left-0.5" : "left-[calc(100%-1.875rem)]"}`} />
          <span className="relative z-10 flex w-1/2 justify-center">dark</span>
          <span className="relative z-10 flex w-1/2 justify-center">light</span>
        </button>
      </div>
    </header>
  );
}
