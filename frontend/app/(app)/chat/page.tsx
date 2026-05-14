"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Plug, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useLLMStore } from "@/stores/llmStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_PREFIX = "/api/v1/llm/github";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

async function callChat(
  authMode: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
): Promise<string> {
  const endpoint =
    authMode === "api-key"
      ? `${API_PREFIX}/api-key/chat`
      : `${API_PREFIX}/chat`;

  const body =
    authMode === "api-key"
      ? { api_key: apiKey, model, messages }
      : { model, messages };

  const res = await fetch(`${API_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Chat API error");
  }
  const data = await res.json();
  return data.content ?? "";
}

export default function ChatPage() {
  const { authMode, status, selectedModel, apiKey } = useLLMStore();

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hello! I'm your SecondBrain AI assistant. Connect a model via the sidebar to get started.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const isConnected = status === "connected";
  const canSend = isConnected && !!selectedModel;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading || !canSend) return;

    setChatError(null);
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    const history = [...messages, userMessage].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const content = await callChat(authMode, apiKey, selectedModel!, history);
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Model status bar */}
      {!isConnected && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-sm text-amber-700 dark:text-amber-400">
          <Plug className="h-4 w-4 shrink-0" />
          No model connected — open the sidebar and click{" "}
          <span className="font-medium">Connect AI Model</span>.
        </div>
      )}
      {isConnected && selectedModel && (
        <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border-b border-green-500/20 text-sm text-green-700 dark:text-green-400">
          <Bot className="h-4 w-4 shrink-0" />
          Using <span className="font-medium">{selectedModel}</span> via GitHub
          Copilot
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full p-6" ref={scrollRef}>
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "flex-row-reverse" : "",
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-md",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted",
                  )}
                >
                  {message.role === "user" ? (
                    <User className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                </div>
                <Card
                  className={cn(
                    "max-w-[80%]",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "",
                  )}
                >
                  <CardContent className="p-3">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {message.content}
                    </p>
                    <p
                      className={cn(
                        "text-[10px] mt-1",
                        message.role === "user"
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground",
                      )}
                    >
                      {message.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </CardContent>
                </Card>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Bot className="h-4 w-4" />
                </div>
                <Card>
                  <CardContent className="p-3">
                    <div className="flex gap-1">
                      <span className="animate-bounce">●</span>
                      <span className="animate-bounce [animation-delay:150ms]">
                        ●
                      </span>
                      <span className="animate-bounce [animation-delay:300ms]">
                        ●
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
            {chatError && (
              <div className="flex items-center gap-2 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {chatError}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-2">
          <Input
            placeholder={
              canSend
                ? "Ask a question about your knowledge base…"
                : "Connect a model first…"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1"
            disabled={!canSend || isLoading}
          />
          <Button
            type="submit"
            disabled={isLoading || !input.trim() || !canSend}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
