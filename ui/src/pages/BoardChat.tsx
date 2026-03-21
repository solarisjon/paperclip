import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { MarkdownBody } from "../components/MarkdownBody";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * Board Concierge Chat — a chat interface powered by the board-member skill.
 * Uses /board/chat/stream to invoke Claude with the board skill as system prompt.
 * The user manages their Paperclip company through natural conversation.
 */
export function BoardChat() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([{ label: "Board Chat" }]);
  }, [setBreadcrumbs]);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [statusText, setStatusText] = useState("");
  const [boardIssueId, setBoardIssueId] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [optimisticMessage, setOptimisticMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset state and clear cached comments when company changes
  const prevCompanyRef = useRef(selectedCompanyId);
  useEffect(() => {
    if (prevCompanyRef.current !== selectedCompanyId) {
      if (boardIssueId) {
        queryClient.removeQueries({ queryKey: queryKeys.issues.comments(boardIssueId) });
      }
      setBoardIssueId(null);
      setStreamingText("");
      setStatusText("");
      setInput("");
      setSending(false);
      setOptimisticMessage(null);
      prevCompanyRef.current = selectedCompanyId;
    }
  }, [selectedCompanyId, boardIssueId, queryClient]);

  // Find or detect the board operations issue
  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    if (!issues) {
      setBoardIssueId(null);
      return;
    }
    const boardIssue = issues.find(
      (i) => i.title === "Board Operations" && i.status !== "done" && i.status !== "cancelled",
    );
    setBoardIssueId(boardIssue?.id ?? null);
  }, [issues]);

  // Fetch comments for the board issue
  const { data: comments } = useQuery({
    queryKey: queryKeys.issues.comments(boardIssueId ?? ""),
    queryFn: () => issuesApi.listComments(boardIssueId!),
    enabled: !!boardIssueId,
    refetchInterval: 3000,
  });

  const sortedComments = (comments ?? [])
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Clear optimistic message once server-persisted comments include it
  useEffect(() => {
    if (optimisticMessage && sortedComments.length > 0) {
      const lastUserComment = [...sortedComments]
        .reverse()
        .find((c) => !c.authorAgentId && c.authorUserId !== "board-concierge");
      if (lastUserComment?.body === optimisticMessage) {
        setOptimisticMessage(null);
      }
    }
  }, [sortedComments, optimisticMessage]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sortedComments.length, streamingText, statusText, optimisticMessage]);

  // Elapsed timer for thinking state
  useEffect(() => {
    if (sending) {
      setElapsedSec(0);
      elapsedTimerRef.current = setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);
    } else {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
    }
    return () => {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, [sending]);

  const sendMessage = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed || sending || !selectedCompanyId) return;

      // Show user message immediately
      setOptimisticMessage(trimmed);
      setSending(true);
      setInput("");
      setStreamingText("");
      setStatusText("Connecting...");

      try {
        const controller = new AbortController();
        const fetchTimeout = setTimeout(() => controller.abort(), 130000);
        const res = await fetch("/api/board/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: selectedCompanyId,
            message: trimmed,
            taskId: boardIssueId ?? undefined,
          }),
          signal: controller.signal,
        });
        clearTimeout(fetchTimeout);

        if (!res.ok || !res.body) {
          throw new Error("Board chat stream not available");
        }

        setStatusText("Thinking...");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "chunk" && event.text) {
                accumulated += event.text;
                setStreamingText(accumulated);
                setStatusText("");
              } else if (event.type === "status" && event.text) {
                setStatusText(event.text);
              } else if (event.type === "start" && event.issueId) {
                setBoardIssueId(event.issueId);
              } else if (event.type === "done") {
                if (event.issueId) {
                  queryClient.invalidateQueries({
                    queryKey: queryKeys.issues.comments(event.issueId),
                  });
                  queryClient.invalidateQueries({
                    queryKey: queryKeys.issues.list(selectedCompanyId),
                  });
                }
              }
            } catch {
              /* malformed SSE line */
            }
          }
        }

        setStreamingText("");
        setStatusText("");
        if (boardIssueId) {
          queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(boardIssueId) });
        }
      } catch (err) {
        console.error("Board chat error:", err);
        setStatusText("");
      } finally {
        setSending(false);
        inputRef.current?.focus();
      }
    },
    [sending, selectedCompanyId, boardIssueId, queryClient],
  );

  const handleSend = useCallback(() => {
    sendMessage(input);
  }, [input, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  if (!selectedCompanyId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-sm">
          <h2 className="text-lg font-semibold">No company selected</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Select a company to start chatting with your board concierge.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100%+3rem)] -m-6">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Board Concierge</h2>
        <p className="text-xs text-muted-foreground">
          {selectedCompany?.name ?? "Your company"} — manage your org through chat
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {sortedComments.length === 0 && !streamingText && !sending && !optimisticMessage && (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground mb-4">
              Ask me anything about your company — hiring, tasks, costs, approvals.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {[
                "What's happening today?",
                "Help me build a hiring plan",
                "Show me my costs",
                "List pending approvals",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => sendMessage(suggestion)}
                  className="px-3 py-1.5 text-xs rounded-full border border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {sortedComments.map((comment) => {
          const isUser = !comment.authorAgentId && comment.authorUserId !== "board-concierge";
          return (
            <div
              key={comment.id}
              className={cn("flex", isUser ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] px-3 py-2 text-sm",
                  isUser
                    ? "bg-blue-600 text-white [border-radius:12px_12px_0px_12px]"
                    : "bg-muted text-foreground [border-radius:12px_12px_12px_0px]",
                )}
              >
                <MarkdownBody>{comment.body ?? ""}</MarkdownBody>
              </div>
            </div>
          );
        })}

        {/* Optimistic user message — shows instantly before server persists */}
        {optimisticMessage && (
          <div className="flex justify-end">
            <div className="max-w-[85%] px-3 py-2 text-sm bg-blue-600 text-white [border-radius:12px_12px_0px_12px]">
              {optimisticMessage}
            </div>
          </div>
        )}

        {/* Streaming response */}
        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[85%] [border-radius:12px_12px_12px_0px] px-3 py-2 text-sm bg-muted text-foreground">
              <MarkdownBody>{streamingText}</MarkdownBody>
            </div>
          </div>
        )}

        {/* Status bar — always visible while sending, independent from the chat bubble */}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground pl-1">
            <img src="/paperclip-thinking.svg" alt="" className="inline-block shrink-0" style={{ width: 14, height: 14 }} />
            <span>{statusText || "Thinking..."}</span>
            {elapsedSec > 0 && (
              <span className="opacity-50">{elapsedSec}s</span>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border p-3">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your company..."
            rows={1}
            className="flex-1 resize-none [border-radius:12px] border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            disabled={sending}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
