"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileQuestion, Loader2, Download, ExternalLink } from "lucide-react";
import { itemFileUrl, type Item } from "@/lib/api";
import { getAccessToken } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Loaded =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "blob"; url: string }
  | { kind: "text"; content: string }
  | { kind: "markdown"; content: string }
  | { kind: "none" };

function isMarkdown(item: Item): boolean {
  const name = (item.title ?? "").toLowerCase();
  return (
    name.endsWith(".md") ||
    name.endsWith(".markdown") ||
    item.mime_type === "text/markdown"
  );
}

function MarkdownBody({ content }: { content: string }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-2 text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold mt-6 mb-4 pb-2 border-b border-border">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-bold mt-6 mb-3">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-semibold mt-5 mb-2">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-base font-semibold mt-4 mb-2">{children}</h4>
          ),
          p: ({ children }) => (
            <p className="mb-4 leading-7">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          del: ({ children }) => (
            <del className="line-through text-muted-foreground">{children}</del>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-6 mb-4 space-y-1.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-6 mb-4 space-y-1.5">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="leading-7">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-brand/50 pl-4 my-4 text-muted-foreground italic">
              {children}
            </blockquote>
          ),
          pre: ({ children }) => (
            <pre className="bg-muted rounded-lg p-4 my-4 overflow-x-auto text-xs font-mono">
              {children}
            </pre>
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = !!className;
            return (
              <code
                className={cn(
                  "font-mono text-xs",
                  isBlock ? className : "bg-muted px-1.5 py-0.5 rounded"
                )}
                {...props}
              >
                {children}
              </code>
            );
          },
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand underline underline-offset-2 hover:no-underline"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="my-6 border-border" />,
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="border border-border px-3 py-2 font-semibold text-left">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-3 py-2">{children}</td>
          ),
          tr: ({ children }) => (
            <tr className="even:bg-muted/30">{children}</tr>
          ),
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={alt ?? ""} className="max-w-full rounded my-2" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

const FETCHABLE_TYPES = new Set(["text", "url", "doc"]);

export function FileContent({ item }: { item: Item }) {
  const canFetch = !!item.storage_key || FETCHABLE_TYPES.has(item.content_type);
  const [state, setState] = useState<Loaded>(canFetch ? { kind: "loading" } : { kind: "none" });

  useEffect(() => {
    if (!canFetch) {
      setState({ kind: "none" });
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;
    setState({ kind: "loading" });

    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch(itemFileUrl(item.id), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`Could not load file (${res.status})`);
        const blob = await res.blob();
        if (cancelled) return;

        if (item.content_type === "text" || item.content_type === "doc") {
          const isTextual =
            blob.type.startsWith("text/") ||
            blob.type === "application/json" ||
            item.content_type === "text";
          if (isTextual) {
            const text = await blob.text();
            if (cancelled) return;
            setState(
              isMarkdown(item)
                ? { kind: "markdown", content: text }
                : { kind: "text", content: text }
            );
            return;
          }
        }
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setState({ kind: "blob", url: objectUrl });
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : "Failed to load file",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.id, item.storage_key, item.content_type, canFetch]);

  if (state.kind === "loading") {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground animate-fade-in">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
        <p className="text-xs font-medium">Loading file…</p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground animate-fade-in">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-destructive/10">
          <FileQuestion className="h-6 w-6 text-destructive" />
        </div>
        <p className="text-sm">{state.message}</p>
      </div>
    );
  }

  if (state.kind === "markdown") {
    return <MarkdownBody content={state.content} />;
  }

  if (state.kind === "text") {
    return (
      <pre className="mx-auto max-w-3xl whitespace-pre-wrap break-words rounded-xl border border-border bg-muted/60 p-4 font-mono text-xs leading-relaxed">
        {state.content}
      </pre>
    );
  }

  if (state.kind === "none") {
    return (
      <div className="max-w-2xl mx-auto space-y-4 p-2">
        {item.source_url && (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-brand hover:underline"
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            {item.source_url}
          </a>
        )}
        {item.summary && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Summary</p>
            <p className="text-sm leading-relaxed">{item.summary}</p>
          </div>
        )}
        {!item.source_url && !item.summary && (
          <p className="text-sm text-muted-foreground">
            No content available yet — AI is still processing this item.
          </p>
        )}
      </div>
    );
  }

  // blob — render by type
  if (item.content_type === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={state.url}
        alt={item.title ?? "image"}
        className="mx-auto max-h-full rounded-md"
      />
    );
  }
  if (item.content_type === "pdf") {
    return (
      <iframe
        src={state.url}
        className="h-full min-h-[70vh] w-full rounded-md bg-white"
        title="PDF"
      />
    );
  }
  if (item.content_type === "audio") {
    return (
      <div className="flex h-40 items-center justify-center">
        <audio src={state.url} controls className="w-full max-w-md" />
      </div>
    );
  }
  if (item.content_type === "video") {
    return (
      <video src={state.url} controls className="mx-auto max-h-full rounded-md" />
    );
  }
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground animate-fade-in">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted">
        <FileQuestion className="h-7 w-7" />
      </div>
      <p className="text-sm">This file type can&apos;t be previewed in the browser.</p>
      <a
        href={state.url}
        download={item.title ?? "download"}
        className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-soft transition-transform hover:-translate-y-0.5"
      >
        <Download className="h-3.5 w-3.5" />
        Download file
      </a>
    </div>
  );
}
