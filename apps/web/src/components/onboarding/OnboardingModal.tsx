"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Inbox, Network, MessageCircle, Search, Sparkles } from "lucide-react";
import { SPRING, EASE_OUT } from "@/components/ui/motion";

const STEPS = [
  {
    icon: Inbox,
    title: "Save anything to your Inbox",
    description:
      "Paste a URL, drop a file, or type a note. SecondBrain AI will classify, tag, and summarise it automatically — usually in under 5 seconds.",
    color: "text-brand",
    bg: "bg-brand-muted",
  },
  {
    icon: Network,
    title: "Explore your Knowledge Graph",
    description:
      "As you save more items, the AI builds a graph connecting related ideas. Click any node to open the item, or drag to explore connections.",
    color: "text-foreground",
    bg: "bg-muted",
  },
  {
    icon: Search,
    title: "Search with AI",
    description:
      "Use keyword search for exact matches, or toggle the AI button for semantic search that understands meaning — even if the words don't match.",
    color: "text-brand",
    bg: "bg-brand-muted",
  },
  {
    icon: MessageCircle,
    title: "Chat with your knowledge base",
    description:
      'Ask questions in plain English: "What did I save about React last week?" or "Find my notes on sleep." The assistant cites your items.',
    color: "text-foreground",
    bg: "bg-muted",
  },
];

const STORAGE_KEY = "sb_onboarding_done";

export function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const done = localStorage.getItem(STORAGE_KEY);
      if (!done) setOpen(true);
    }
  }, []);

  function finish() {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  }

  const current = STEPS[step];
  const Icon = current.icon;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Glass backdrop */}
          <div
            className="absolute inset-0 glass bg-background/40"
            onClick={finish}
            aria-hidden
          />

          <motion.div
            className="relative w-full max-w-md rounded-2xl bg-card border border-border shadow-lift overflow-hidden"
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={SPRING}
          >
            {/* Progress bar */}
            <div className="h-1 bg-muted">
              <motion.div
                className="h-full bg-brand"
                initial={false}
                animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                transition={{ duration: 0.4, ease: EASE_OUT }}
              />
            </div>

            <div className="p-6 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-brand" />
                  <span className="text-sm font-semibold text-brand">
                    Welcome to SecondBrain
                  </span>
                </div>
                <button
                  onClick={finish}
                  className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                  title="Skip onboarding"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Step content */}
              <div className="min-h-[12rem] flex items-center">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.3, ease: EASE_OUT }}
                    className="flex w-full flex-col items-center text-center gap-4 py-2"
                  >
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={SPRING}
                      className={`flex h-16 w-16 items-center justify-center rounded-2xl ${current.bg}`}
                    >
                      <Icon className={`h-8 w-8 ${current.color}`} />
                    </motion.div>
                    <div>
                      <h2 className="font-display text-lg font-bold">
                        {current.title}
                      </h2>
                      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                        {current.description}
                      </p>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Step dots */}
              <div className="flex justify-center gap-1.5">
                {STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className={`h-2 rounded-full transition-all ${
                      i === step ? "w-6 bg-brand" : "w-2 bg-muted-foreground/30"
                    }`}
                  />
                ))}
              </div>

              {/* Navigation */}
              <div className="flex justify-between gap-2 pt-1">
                <button
                  onClick={() => (step > 0 ? setStep(step - 1) : finish())}
                  className="rounded-xl px-4 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  {step === 0 ? "Skip" : "Back"}
                </button>
                <button
                  onClick={() =>
                    step < STEPS.length - 1 ? setStep(step + 1) : finish()
                  }
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft hover:shadow-lift transition-all active:scale-[0.99]"
                >
                  {step < STEPS.length - 1 ? "Next" : "Get started"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
