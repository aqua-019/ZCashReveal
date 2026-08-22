/**
 * Numbered section header. The repeating "01", "02", ... rhythm in
 * LeakPanel and any other long-form forensic surface.
 *
 *   <SectionHeader index="08" title="Anonymity sets" />
 *
 * Renders the ordinal in mono small-caps gold + the title in display font.
 * The numbering is a content concern (not generated) — the caller picks
 * the ordinal so adding a new section doesn't renumber existing ones.
 */

export interface SectionHeaderProps {
  index: string;
  title: string;
}

export function SectionHeader({ index, title }: SectionHeaderProps) {
  return (
    <div className="flex items-baseline gap-3 mb-4">
      <span className="mono text-[10px] text-[var(--color-zec-gold)] tracking-[0.18em]">
        {index}
      </span>
      <h3 className="display text-[22px] text-ink">{title}</h3>
    </div>
  );
}
