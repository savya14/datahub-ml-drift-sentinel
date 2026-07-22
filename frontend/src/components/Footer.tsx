import { Github } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border mt-16 py-6">
      <div className="mx-auto flex max-w-7xl items-center justify-center px-6 text-xs text-[var(--text-secondary)]">
        <a
          href="https://github.com/your-org/datahub-ml-drift-sentinel"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 hover:text-[var(--text-primary)] transition-colors"
        >
          <Github className="h-4 w-4" />
          <span>github</span>
        </a>
      </div>
    </footer>
  );
}
