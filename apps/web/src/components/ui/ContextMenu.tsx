"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { EASE_OUT } from "@/components/ui/motion";

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
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.94, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.16, ease: EASE_OUT }}
      style={{ left, top, transformOrigin: "top left" }}
      className="fixed z-[60] min-w-[184px] overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lift"
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
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
              item.destructive
                ? "text-destructive hover:bg-destructive/10"
                : "text-foreground hover:bg-accent"
            )}
          >
            {item.icon && <item.icon className="h-4 w-4 shrink-0 opacity-80" />}
            <span className="truncate">{item.label}</span>
          </button>
        </div>
      ))}
    </motion.div>
  );
}
