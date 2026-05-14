"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  ExternalLink,
  Unplug,
  Plug,
} from "lucide-react";
import { useLLMStore, type AuthMode } from "@/stores/llmStore";

interface Props {
  open: boolean;
  onClose: () => void;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "connected")
    return (
      <Badge className="gap-1 bg-green-500/20 text-green-600 border-green-500/30">
        <CheckCircle2 className="h-3 w-3" /> Connected
      </Badge>
    );
  if (status === "pending")
    return (
      <Badge className="gap-1 bg-yellow-500/20 text-yellow-600 border-yellow-500/30">
        <Loader2 className="h-3 w-3 animate-spin" /> Pending
      </Badge>
    );
  if (status === "expired")
    return (
      <Badge className="gap-1 bg-red-500/20 text-red-600 border-red-500/30">
        <XCircle className="h-3 w-3" /> Expired
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1">
      <Unplug className="h-3 w-3" /> Disconnected
    </Badge>
  );
}

export function ModelConnectDialog({ open, onClose }: Props) {
  const {
    authMode,
    status,
    models,
    selectedModel,
    apiKey,
    deviceCode,
    setAuthMode,
    setApiKey,
    setSelectedModel,
    startOAuth,
    disconnect,
    fetchModelsWithKey,
  } = useLLMStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fetchedRef = useRef(false);

  // On open, if OAuth and connected with no models loaded, fetch once
  useEffect(() => {
    if (
      open &&
      status === "connected" &&
      models.length === 0 &&
      authMode === "oauth" &&
      !fetchedRef.current
    ) {
      fetchedRef.current = true;
      useLLMStore
        .getState()
        .fetchModels()
        .catch(() => {});
    }
    if (!open) fetchedRef.current = false;
  }, [open, status, authMode]); // intentionally exclude models.length to avoid loop

  const handleCopy = useCallback(() => {
    if (!deviceCode) return;
    navigator.clipboard.writeText(deviceCode.user_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [deviceCode]);

  const handleOpenGitHub = useCallback(() => {
    if (!deviceCode) return;
    navigator.clipboard.writeText(deviceCode.user_code);
    window.open(deviceCode.verification_uri, "_blank", "noopener,noreferrer");
  }, [deviceCode]);

  async function handleStartOAuth() {
    setError(null);
    setLoading(true);
    try {
      await startOAuth();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start OAuth flow");
    } finally {
      setLoading(false);
    }
  }

  async function handleConnectApiKey() {
    setError(null);
    setLoading(true);
    try {
      await fetchModelsWithKey();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Invalid API key or connection error",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setError(null);
    setLoading(true);
    try {
      await disconnect();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setLoading(false);
    }
  }

  const isConnected = status === "connected";
  const isPending = status === "pending";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5" />
              GitHub Copilot Model
            </DialogTitle>
            <StatusBadge status={status} />
          </div>
          <DialogDescription>
            Connect to GitHub Copilot to use AI chat models.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <Tabs
          value={authMode}
          onValueChange={(v) => {
            setAuthMode(v as AuthMode);
            setError(null);
          }}
        >
          <TabsList className="w-full">
            <TabsTrigger value="oauth" className="flex-1">
              OAuth (Device Code)
            </TabsTrigger>
            <TabsTrigger value="api-key" className="flex-1">
              API Key / PAT
            </TabsTrigger>
          </TabsList>

          {/* ── OAuth Tab ── */}
          <TabsContent value="oauth" className="space-y-4 pt-2">
            {!isConnected && !isPending && (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Authorise SecondBrain to use GitHub Copilot on your behalf via
                  the device code flow — no password required.
                </p>
                <Button
                  className="w-full"
                  onClick={handleStartOAuth}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Connect with GitHub OAuth
                </Button>
              </div>
            )}

            {isPending && deviceCode && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                  <p className="text-sm font-medium">
                    1. Copy the code below, then click the button to open
                    GitHub.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-background border px-3 py-2 text-lg font-mono tracking-widest text-center">
                      {deviceCode.user_code}
                    </code>
                    <Button size="icon" variant="outline" onClick={handleCopy}>
                      {copied ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-sm font-medium">
                    2. Paste the code on GitHub and authorise the app.
                  </p>
                  <Button className="w-full gap-2" onClick={handleOpenGitHub}>
                    <ExternalLink className="h-4 w-4" />
                    Open GitHub &amp; Paste Code
                  </Button>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Waiting for authorisation…
                </div>
              </div>
            )}

            {isConnected && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-green-500/5 border-green-500/20 p-3 flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  GitHub Copilot connected via OAuth.
                </div>
                {models.length > 0 && (
                  <div className="space-y-2">
                    <Label>Chat model</Label>
                    <Select
                      value={selectedModel ?? ""}
                      onValueChange={setSelectedModel}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select model…" />
                      </SelectTrigger>
                      <SelectContent>
                        {models.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={handleDisconnect}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Disconnect
                </Button>
              </div>
            )}
          </TabsContent>

          {/* ── API Key Tab ── */}
          <TabsContent value="api-key" className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="api-key-input">
                GitHub PAT / Copilot API Key
              </Label>
              <Input
                id="api-key-input"
                type="password"
                placeholder="ghp_xxxxxxxxxxxxxxxx"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={isConnected && authMode === "api-key"}
              />
              <p className="text-xs text-muted-foreground">
                A GitHub personal access token with{" "}
                <code className="text-xs">copilot</code> scope.
              </p>
            </div>

            {isConnected && authMode === "api-key" ? (
              <div className="space-y-4">
                <div className="rounded-lg border bg-green-500/5 border-green-500/20 p-3 flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Connected via API key.
                </div>
                {models.length > 0 && (
                  <div className="space-y-2">
                    <Label>Chat model</Label>
                    <Select
                      value={selectedModel ?? ""}
                      onValueChange={setSelectedModel}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select model…" />
                      </SelectTrigger>
                      <SelectContent>
                        {models.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={handleDisconnect}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button
                className="w-full"
                onClick={handleConnectApiKey}
                disabled={loading || !apiKey.trim()}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Connect with API Key
              </Button>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
