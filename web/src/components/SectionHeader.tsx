export function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-accent/65 text-[10px] tracking-[0.3em]">▸ {label}</span>
      <div className="flex-1 h-px bg-gradient-to-r from-accent/20 to-transparent" />
    </div>
  );
}
