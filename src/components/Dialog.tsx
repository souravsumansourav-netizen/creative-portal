"use client";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Frosted dialog over a dimmed, blurred scrim. Esc or a click outside closes it. */
export function Dialog({ title, subtitle, onClose, children, footer, width = "max-w-md" }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="scrim anim-fade fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`sheet anim-pop flex max-h-full w-full ${width} flex-col overflow-hidden rounded-3xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
          <div>
            <h2 className="text-[1.375rem] font-semibold tracking-[-0.02em]">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full bg-black/[0.06] p-1.5 text-stone-600 transition hover:bg-black/[0.10] active:scale-95"><X size={16} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-black/[0.06] px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
