import type { LucideIcon } from "lucide-react";
import React from "react";

export type PortalQuickMenuItem = {
  key: string;
  label: string;
  ariaLabel: string;
  href: string | null | undefined;
} & (
  | { icon: LucideIcon; progress?: never }
  | { icon?: never; progress: { completed: number; total: number } }
);

export default function PortalQuickMenu({
  items,
}: {
  items: PortalQuickMenuItem[];
}) {
  const visibleItems = items.filter(
    (item): item is PortalQuickMenuItem & { href: string } =>
      Boolean(item.href)
  );

  if (visibleItems.length === 0) return null;

  return (
    <nav
      className="mt-4 grid w-full max-w-[26rem] gap-1.5"
      style={{
        gridTemplateColumns: `repeat(${visibleItems.length > 5 ? 3 : visibleItems.length}, minmax(0, 1fr))`,
      }}
      aria-label="학습 결과 바로가기"
    >
      {visibleItems.map(item => {
        const Icon = item.icon;
        const progress = item.progress;
        return (
          <a
            key={item.key}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={item.ariaLabel}
            title={item.ariaLabel}
            className="group flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-1.5 py-2.5 text-white backdrop-blur-sm transition hover:border-white/40 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8C59A]"
          >
            <span className={`flex h-9 items-center justify-center rounded-full bg-white/15 transition group-hover:bg-white/20 ${progress ? "min-w-[3.25rem] flex-col px-1" : "w-9"}`}>
              {progress ? (
                <>
                  <span className="text-[12px] font-bold leading-4 tabular-nums" aria-hidden="true">
                    {progress.completed} / {progress.total}
                  </span>
                  <span className="text-[9px] font-semibold leading-3" aria-hidden="true">
                    {progress.completed < progress.total ? "new" : "done"}
                  </span>
                </>
              ) : Icon ? (
                <Icon className="h-5 w-5" aria-hidden="true" />
              ) : null}
            </span>
            <span className="w-full truncate text-center text-[11px] font-semibold leading-4">
              {item.label}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
