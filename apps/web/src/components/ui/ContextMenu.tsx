"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type MenuItem = {
  label: string;
  icon?: React.ElementType;
  onClick: () => void;
  destructive?: boolean;
  separatorBefore?: boolean;
};

type Props = {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
};

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    // Defer so the opening click doesn't immediately close it.
    const t = setTimeout(() => {
      window.addEventListener("mousedown", handlePointer);
      window.addEventListener("keydown", handleKey);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Keep the menu inside the viewport.
  const left = Math.min(x, (typeof window !== "undefined" ? window.innerWidth : x) - 200);
  const top = Math.min(y, (typeof window !== "undefined" ? window.innerHeight : y) - items.length * 36 - 16);

  return (
    <div
      ref={ref}
      className="fixed z-[60] min-w-[180px] rounded-lg border border-border bg-card py-1 shadow-xl"
      style={{ left, top }}
    >
      {items.map((item, i) => (
        <div key={item.label}>
          {item.separatorBefore && i > 0 && <div className="my-1 h-px bg-border" />}
          <button
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors",
              item.destructive
                ? "text-red-600 hover:bg-red-50"
                : "hover:bg-muted"
            )}
          >
            {item.icon && <item.icon className="h-4 w-4 shrink-0" />}
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}
