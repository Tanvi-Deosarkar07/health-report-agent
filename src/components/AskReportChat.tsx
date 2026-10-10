"use client";

import { useState } from "react";
import type { ChatMessage, ExplainedTest } from "@/lib/types";

interface AskReportChatProps {
  results: ExplainedTest[];
  age: number;
  sex: "M" | "F";
  labName: string | null;
  reportDate: string | null;
}

export function AskReportChat({ results, age, sex, labName, reportDate }: AskReportChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    setError(null);
    const priorHistory = messages;
    setMessages([...priorHistory, { role: "user", content: trimmed }]);
    setInput("");
    setIsSending(true);

    try {
      const res = await fetch("/api/pipeline/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          results,
          age,
          sex,
          labName,
          reportDate,
          history: priorHistory,
          message: trimmed,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to get a response.");
      }
      setMessages([...priorHistory, { role: "user", content: trimmed }, { role: "assistant", content: data.reply as string }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-foreground/10 p-4">
      <div>
        <h2 className="text-lg font-semibold">Ask about your results</h2>
        <p className="text-sm text-foreground/60">
          Ask follow-up questions about this specific report. Informational only, not medical advice.
        </p>
      </div>

      {messages.length > 0 && (
        <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "self-end bg-foreground text-background"
                  : "self-start bg-foreground/[0.05]"
              }`}
            >
              {m.content}
            </div>
          ))}
        </div>
      )}

      {isSending && <p className="text-sm text-foreground/50">Thinking…</p>}

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="e.g. What does my LDL result mean?"
          className="flex-1 rounded-md border border-foreground/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isSending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
