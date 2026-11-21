"use client";
import {
  Children, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type ReactElement, type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, UploadCloud } from "lucide-react";

/* ------------------------------------------------------------------ Select
 * Drop-in replacement for <select>: same <option> children, same onChange(e.target.value).
 * Opens a frosted menu from the trigger (anchored origin), with full keyboard support. */
type Opt = { value: string; label: ReactNode; text: string; disabled: boolean };

const textOf = (n: ReactNode): string =>
  typeof n === "string" || typeof n === "number" ? String(n) : Array.isArray(n) ? n.map(textOf).join("") : "";

export function Select({ value, onChange, children, className = "", disabled = false }: {
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const options: Opt[] = useMemo(
    () =>
      Children.toArray(children)
        .filter((c): c is ReactElement<any> => isValidElement(c) && (c as ReactElement<any>).type === "option")
        .map((c) => ({
          value: String(c.props.value ?? ""),
          label: c.props.children,
          text: textOf(c.props.children),
          disabled: !!c.props.disabled,
        })),
    [children],
  );

  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; up: boolean }>({ left: 0, width: 0, up: false });
  const typed = useRef({ s: "", t: 0 });

  const selected = options.find((o) => o.value === String(value ?? ""));
  const isPlaceholder = !selected || (selected.disabled && selected.value === "");

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const up = window.innerHeight - r.bottom < 280 && r.top > window.innerHeight - r.bottom;
    setPos({ left: r.left, width: r.width, up, top: up ? undefined : r.bottom + 6, bottom: up ? window.innerHeight - r.top + 6 : undefined });
  }, []);

  const show = () => {
    if (disabled) return;
    place();
    setActive(Math.max(0, options.findIndex((o) => o.value === String(value ?? ""))));
    setOpen(true);
  };
  const close = (refocus = true) => { setOpen(false); if (refocus) btn.current?.focus(); };
  const pick = (o: Opt) => { if (o.disabled) return; onChange({ target: { value: o.value } }); close(); };

  // dismiss on outside press / resize / page scroll; keep position fresh
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const scroll = (e: Event) => { if (!menu.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", scroll, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open, place]);

  useLayoutEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const move = (dir: 1 | -1) => {
    let i = active;
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length;
      if (!options[i].disabled) return setActive(i);
    }
  };

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Home") { e.preventDefault(); setActive(options.findIndex((o) => !o.disabled)); }
    else if (e.key === "End") { e.preventDefault(); setActive(options.map((o) => o.disabled).lastIndexOf(false)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (options[active]) pick(options[active]); }
    else if (e.key === "Tab") setOpen(false);
    else if (e.key.length === 1) {
      // type-ahead
      const now = Date.now();
      typed.current.s = now - typed.current.t > 600 ? e.key.toLowerCase() : typed.current.s + e.key.toLowerCase();
      typed.current.t = now;
      const hit = options.findIndex((o) => !o.disabled && o.text.toLowerCase().startsWith(typed.current.s));
      if (hit >= 0) setActive(hit);
    }
  }

  return (
    <>
      <button
        ref={btn} type="button" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`}
        disabled={disabled} onClick={() => (open ? close(false) : show())} onKeyDown={onKeyDown}
        className={`inline-flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        <span className={`truncate ${isPlaceholder ? "text-stone-400" : ""}`}>{selected ? selected.label : "Select…"}</span>
        <ChevronsUpDown size={14} className="shrink-0 text-stone-400" aria-hidden />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={menu} id={`${id}-list`} role="listbox"
          style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.width, maxWidth: 380, transformOrigin: pos.up ? "bottom left" : "top left" }}
          className="sheet anim-pop z-[80] max-h-72 overflow-y-auto rounded-xl p-1 text-[0.9375rem]"
          onPointerDown={(e) => e.preventDefault()} /* keep focus on the trigger */
        >
          {options.map((o, i) => (
            <div
              key={`${o.value}-${i}`} data-i={i} role="option" aria-selected={o.value === String(value ?? "")} aria-disabled={o.disabled}
              onMouseMove={() => !o.disabled && setActive(i)} onClick={() => pick(o)}
              className={`flex cursor-default items-center gap-2 rounded-lg py-1.5 pl-2 pr-3 ${o.disabled ? "text-stone-400" : i === active ? "bg-maroon-700 text-white" : "text-stone-900"}`}
            >
              <span className="flex w-4 shrink-0 justify-center">{o.value === String(value ?? "") && !o.disabled && <Check size={14} strokeWidth={2.5} />}</span>
              <span className="truncate">{o.label}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

/* --------------------------------------------------------------- Segmented
 * iOS-style segmented control: a thumb glides to the chosen option (settles without overshoot). */
export function Segmented<T extends string>({ options, value, onChange, className = "" }: {
  options: { value: T; label: ReactNode; badge?: ReactNode }[];
  value: T | "";
  onChange: (v: T) => void;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  const [ready, setReady] = useState(false);

  const measure = useCallback(() => {
    const el = refs.current[value as string];
    if (el) setThumb({ x: el.offsetLeft, w: el.offsetWidth });
    else setThumb(null);
  }, [value]);

  useLayoutEffect(() => { measure(); }, [measure, options.length]);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true)); // no slide-in on first paint
    const ro = new ResizeObserver(measure);
    if (wrap.current) ro.observe(wrap.current);
    return () => { cancelAnimationFrame(id); ro.disconnect(); };
  }, [measure]);

  return (
    <div ref={wrap} role="tablist" className={`relative inline-flex max-w-full flex-wrap rounded-[11px] bg-black/[0.06] p-[3px] ${className}`}>
      {thumb && (
        <span
          aria-hidden
          className={`absolute bottom-[3px] top-[3px] rounded-[8px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.16),0_0_0_0.5px_rgba(0,0,0,0.04)] ${ready ? "transition-[transform,width] duration-[280ms] ease-[cubic-bezier(0.2,0.9,0.25,1)] motion-reduce:transition-none" : ""}`}
          style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.value} ref={(el) => { refs.current[o.value] = el; }} type="button" role="tab" aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`relative z-10 inline-flex items-center gap-1.5 rounded-[8px] px-3.5 py-1.5 text-[0.875rem] font-medium transition-colors duration-150 active:opacity-70 ${o.value === value ? "text-stone-900" : "text-stone-500 hover:text-stone-800"}`}
        >
          {o.label}
          {o.badge !== undefined && (
            <span className={`rounded-full px-1.5 text-[0.6875rem] font-semibold tabular-nums ${o.value === value ? "bg-maroon-700/10 text-maroon-800" : "bg-black/[0.06] text-stone-500"}`}>{o.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Checkbox
 * Rounded box with an animated tick. Same onChange(e.target.checked) shape as the native one. */
export function Checkbox({ checked, onChange, disabled = false, className = "", title }: {
  checked: boolean;
  onChange?: (e: { target: { checked: boolean } }) => void;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button" role="checkbox" aria-checked={checked} disabled={disabled} title={title}
      onClick={() => onChange?.({ target: { checked: !checked } })}
      className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border align-middle transition-[background-color,border-color,transform] duration-150 active:scale-90 motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "border-maroon-700 bg-maroon-700" : "border-black/20 bg-white hover:border-black/35"
      } ${className}`}
    >
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="2.5,6.4 5,8.9 9.5,3.6" style={{ strokeDasharray: 14, strokeDashoffset: checked ? 0 : 14, transition: "stroke-dashoffset 200ms ease-out" }} />
      </svg>
    </button>
  );
}

/* -------------------------------------------------------------- FilePicker
 * Replaces the browser's "Choose file / No file chosen". Click or drop. Controlled by the parent. */
export function FilePicker({ files, onFiles, accept, multiple = false, disabled = false, label, hint, className = "" }: {
  files: File[];
  onFiles: (f: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  label: string;
  hint?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  useEffect(() => { if (!files.length && input.current) input.current.value = ""; }, [files]);

  const summary = files.length === 1 ? files[0].name : files.length > 1 ? `${files.length} files selected` : null;
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) onFiles(multiple ? [...e.dataTransfer.files] : [...e.dataTransfer.files].slice(0, 1)); }}
      className={`flex items-center gap-3 rounded-xl border border-dashed px-4 py-2.5 text-left transition-colors duration-150 ${over ? "border-maroon-500 bg-maroon-50" : "border-black/15 bg-white/70 hover:border-black/30"} ${disabled ? "opacity-50" : ""} ${className}`}
    >
      <input ref={input} type="file" accept={accept} multiple={multiple} disabled={disabled} className="hidden"
        onChange={(e) => onFiles([...(e.target.files ?? [])])} />
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-maroon-700/10 text-maroon-700"><UploadCloud size={18} /></span>
      <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="min-w-0 text-left">
        <span className="block text-[0.9375rem] font-medium text-stone-900">{summary ?? label}</span>
        <span className="block truncate text-xs text-stone-500">{summary ? "Click to change, or drop other files" : hint ?? "Click or drop here"}</span>
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- Skeletons */
export const Skeleton = ({ className = "" }: { className?: string }) => <div aria-hidden className={`skeleton rounded-lg ${className}`} />;

export function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="rounded-2xl border border-black/[0.06] bg-white p-4 shadow-card">
      <Skeleton className="mb-4 h-4 w-40" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-t border-black/[0.05] py-3">
          <Skeleton className="h-10 w-10 shrink-0 !rounded-xl" />
          <Skeleton className="h-3.5 w-1/4" />
          <Skeleton className="h-3.5 w-1/6" />
          <Skeleton className="ml-auto h-3.5 w-1/5" />
        </div>
      ))}
    </div>
  );
}
