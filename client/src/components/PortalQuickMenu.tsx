import type { LucideIcon } from "lucide-react";

export type PortalQuickMenuItem = {
  key: string;
  label: string;
  ariaLabel: string;
  href: string | null | undefined;
  icon: LucideIcon;
};

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
        gridTemplateColumns: `repeat(${Math.min(visibleItems.length, 5)}, minmax(0, 1fr))`,
      }}
      aria-label="학습 결과 바로가기"
    >
      {visibleItems.map(item => {
        const Icon = item.icon;
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
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white/15 transition group-hover:bg-white/20">
              <Icon className="h-5 w-5" aria-hidden="true" />
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
