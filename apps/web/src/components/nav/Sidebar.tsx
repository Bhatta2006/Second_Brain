"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Inbox,
  BookOpen,
  Network,
  Search,
  MessageCircle,
  LogOut,
  Download,
  Brain,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { exportApi } from "@/lib/api";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import {
  Stagger,
  fadeUpItem,
  staggerContainer,
  SPRING,
  EASE_OUT,
} from "@/components/ui/motion";

const NAV_ITEMS = [
  { href: "/inbox", icon: Inbox, label: "Inbox" },
  { href: "/library", icon: BookOpen, label: "Library" },
  { href: "/graph", icon: Network, label: "Graph" },
  { href: "/search", icon: Search, label: "Search" },
  { href: "/chat", icon: MessageCircle, label: "Chat" },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { signOut, user } = useAuthStore();

  return (
    <div className="flex h-full flex-col px-3 py-5">
      {/* Brand / wordmark */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="mb-7 flex items-center gap-3 px-2"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-muted text-brand shadow-soft">
          <Brain className="h-5 w-5" />
        </span>
        <span className="font-display text-lg font-semibold tracking-tight text-foreground">
          SecondBrain
        </span>
      </motion.div>

      {/* Nav */}
      <Stagger className="flex-1 space-y-1">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
          return (
            <motion.div key={href} variants={fadeUpItem}>
              <Link
                href={href}
                onClick={onNavigate}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "text-brand"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {active && (
                  <>
                    <motion.span
                      layoutId="nav-active-pill"
                      transition={SPRING}
                      className="absolute inset-0 rounded-xl bg-brand-muted"
                    />
                    <motion.span
                      layoutId="nav-active-bar"
                      transition={SPRING}
                      className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-brand"
                    />
                  </>
                )}
                <Icon className="relative z-10 h-4 w-4 shrink-0" />
                <span className="relative z-10">{label}</span>
              </Link>
            </motion.div>
          );
        })}
      </Stagger>

      {/* Footer */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="mt-auto space-y-1 border-t border-border pt-4"
      >
        <motion.div
          variants={fadeUpItem}
          className="mb-1 truncate px-3 text-xs text-muted-foreground"
        >
          {user?.email}
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <ThemeToggle />
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <button
            onClick={() => exportApi.json()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Export knowledge base as JSON"
          >
            <Download className="h-4 w-4 shrink-0" />
            Export data
          </button>
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar with menu trigger */}
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3 md:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-muted text-brand">
            <Brain className="h-4 w-4" />
          </span>
          <span className="font-display text-base font-semibold tracking-tight">
            SecondBrain
          </span>
        </span>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden h-full w-60 shrink-0 border-r border-border bg-card md:block">
        <SidebarContent />
      </aside>

      {/* Mobile overlay drawer */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={SPRING}
              className="absolute left-0 top-0 h-full w-64 border-r border-border bg-card shadow-lift"
            >
              <button
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
              <SidebarContent onNavigate={() => setOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
