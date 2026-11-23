"use client";

/** Single-choice filter chips with live counts. Only categories that actually occur are listed. */
export function CategoryChips({ counts, total, value, onChange }: {
  counts: { group: string; count: number }[];
  total: number;
  value: string;
  onChange: (group: string) => void;
}) {
  const chip = (key: string, label: string, n: number) => {
    const active = value === key;
    return (
      <button
        key={key} type="button" aria-pressed={active} onClick={() => onChange(key)}
        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[0.8125rem] font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.97] motion-reduce:active:scale-100 ${
          active ? "bg-stone-900 text-white" : "bg-black/[0.05] text-stone-700 hover:bg-black/[0.08]"
        }`}
      >
        {label}
        <span className={`tabular-nums ${active ? "text-white/65" : "text-stone-400"}`}>{n}</span>
      </button>
    );
  };

  return (
    <div role="group" aria-label="Filter by category" className="flex flex-wrap items-center gap-2">
      {chip("all", "All", total)}
      {counts.map((c) => chip(c.group, c.group, c.count))}
    </div>
  );
}
