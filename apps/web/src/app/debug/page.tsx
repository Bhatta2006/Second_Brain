"use client";

export default function DebugPage() {
  return (
    <div style={{ padding: "20px", fontFamily: "monospace" }}>
      <h1>Environment Debug</h1>
      <pre>
        {JSON.stringify(
          {
            NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
            NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
              ? "SET (hidden)"
              : "NOT SET",
            NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
          },
          null,
          2
        )}
      </pre>
    </div>
  );
}
