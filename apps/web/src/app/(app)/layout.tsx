"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Brain } from "lucide-react";
import { motion } from "framer-motion";
import { useAuthStore } from "@/stores/authStore";
import { Sidebar } from "@/components/nav/Sidebar";
import { OnboardingModal } from "@/components/onboarding/OnboardingModal";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, init } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background bg-dots">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center gap-4"
        >
          <span className="relative flex h-14 w-14 items-center justify-center">
            <span className="absolute inset-0 animate-spin rounded-full border-2 border-brand/25 border-t-brand" />
            <motion.span
              animate={{ scale: [1, 1.12, 1], opacity: [0.85, 1, 0.85] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-muted text-brand"
            >
              <Brain className="h-5 w-5" />
            </motion.span>
          </span>
          <span className="font-display text-sm font-medium tracking-tight text-muted-foreground">
            SecondBrain
          </span>
        </motion.div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background md:flex-row">
      <Sidebar />
      <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      <OnboardingModal />
    </div>
  );
}
