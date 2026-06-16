"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Brain, Sparkles } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";
import { FadeUp, Stagger, fadeUpItem, EASE_OUT } from "@/components/ui/motion";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuthStore();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isSignUp) {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
      router.push("/inbox");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background text-foreground">
      {/* ── Brand / hero side ───────────────────────────────────────────── */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-foreground text-background p-12">
        {/* Animated background */}
        <div className="absolute inset-0 bg-grid opacity-[0.07]" aria-hidden />
        <motion.div
          aria-hidden
          className="absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full bg-brand/30 blur-3xl"
          animate={{ x: [0, 40, 0], y: [0, 30, 0], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="absolute -bottom-40 -right-20 h-[32rem] w-[32rem] rounded-full bg-brand/20 blur-3xl"
          animate={{ x: [0, -30, 0], y: [0, -40, 0], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />

        <FadeUp className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-brand">
            <Brain className="h-6 w-6" />
          </span>
          <span className="text-lg font-display font-semibold tracking-tight">
            SecondBrain
          </span>
        </FadeUp>

        <div className="relative">
          <FadeUp delay={0.1}>
            <h1 className="font-display text-5xl xl:text-6xl font-bold leading-[1.05] tracking-tight">
              Save anything.
              <br />
              Find everything.
            </h1>
          </FadeUp>
          <FadeUp delay={0.2}>
            <p className="mt-6 max-w-md text-base text-background/70 leading-relaxed">
              Your AI-powered second brain. Capture links, files, and notes —
              then search, connect, and chat with everything you know.
            </p>
          </FadeUp>
        </div>

        <FadeUp delay={0.3} className="relative flex items-center gap-2 text-sm text-background/60">
          <Sparkles className="h-4 w-4 text-brand" />
          <span>Classified, tagged, and summarised automatically.</span>
        </FadeUp>
      </div>

      {/* ── Form side ───────────────────────────────────────────────────── */}
      <div className="relative flex items-center justify-center px-4 py-12">
        {/* Soft brand glow + dots backdrop (visible on mobile too) */}
        <div className="absolute inset-0 bg-dots opacity-[0.4] lg:hidden" aria-hidden />
        <div
          className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-brand/10 blur-3xl"
          aria-hidden
        />

        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
          className="relative w-full max-w-sm"
        >
          {/* Mobile logo mark */}
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-brand">
              <Brain className="h-6 w-6" />
            </span>
            <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">
              SecondBrain
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Save anything. Find everything.
            </p>
          </div>

          <div className="hidden lg:block mb-8">
            <h2 className="font-display text-2xl font-bold tracking-tight">
              {isSignUp ? "Create your account" : "Welcome back"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isSignUp
                ? "Start building your second brain."
                : "Sign in to continue to your second brain."}
            </p>
          </div>

          <Stagger className="space-y-5">
            <motion.form
              variants={fadeUpItem}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-brand/40"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium mb-1.5"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-brand/40"
                />
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-destructive"
                >
                  {error}
                </motion.p>
              )}

              <button
                type="submit"
                disabled={loading}
                className={cn(
                  "w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition-all hover:shadow-lift active:scale-[0.99]",
                  loading && "opacity-60 cursor-not-allowed"
                )}
              >
                {loading
                  ? "Please wait..."
                  : isSignUp
                    ? "Create account"
                    : "Sign in"}
              </button>
            </motion.form>

            <motion.div variants={fadeUpItem} className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs text-muted-foreground">
                <span className="bg-background px-2">or</span>
              </div>
            </motion.div>

            <motion.button
              variants={fadeUpItem}
              onClick={signInWithGoogle}
              className="w-full rounded-xl border border-border bg-card py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Continue with Google
            </motion.button>

            <motion.p
              variants={fadeUpItem}
              className="text-center text-sm text-muted-foreground"
            >
              {isSignUp ? "Already have an account? " : "Don't have an account? "}
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="font-medium text-brand underline-offset-4 hover:underline"
              >
                {isSignUp ? "Sign in" : "Sign up"}
              </button>
            </motion.p>
          </Stagger>
        </motion.div>
      </div>
    </div>
  );
}
