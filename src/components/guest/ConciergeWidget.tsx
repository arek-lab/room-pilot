import { useState, useEffect, useRef } from "react";
import { MessageCircle, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ConciergeResponse {
  content?: string;
  error?: string;
}

export default function ConciergeWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const userMessage: Message = { role: "user", content: text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);
    setError(null);

    const payload = nextMessages.slice(-6);

    try {
      const res = await fetch("/api/guest/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload }),
      });
      const data = (await res.json()) as ConciergeResponse;
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.content ?? "" }]);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setIsOpen(true);
        }}
        className={cn(
          "bg-primary text-primary-foreground fixed right-4 bottom-6 z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-opacity",
          isOpen && "pointer-events-none opacity-0",
        )}
        aria-label="Ask the concierge"
      >
        <Sparkles size={20} />
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-end p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <div className="border-border bg-card flex h-[520px] w-full max-w-sm flex-col rounded-2xl border shadow-2xl">
            <div className="border-border flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="text-foreground h-5 w-5" />
                <span className="text-foreground text-sm font-semibold">Concierge</span>
              </div>
              <button
                onClick={() => {
                  setIsOpen(false);
                }}
                className="text-muted-foreground hover:bg-muted hover:text-muted-foreground rounded-md p-1"
                aria-label="Close concierge chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {messages.length === 0 && !isLoading && (
                <p className="text-muted-foreground pt-8 text-center text-sm">
                  Ask me anything about the hotel, local area, or your stay.
                </p>
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                    msg.role === "user" ? "bg-foreground text-background ml-auto" : "bg-muted text-foreground mr-auto",
                  )}
                >
                  {msg.content}
                </div>
              ))}
              {isLoading && (
                <div className="bg-muted mr-auto max-w-[85%] rounded-2xl px-3 py-2">
                  <div className="flex h-5 items-center gap-1">
                    <span className="bg-muted-foreground h-2 w-2 animate-bounce rounded-full [animation-delay:-0.3s]" />
                    <span className="bg-muted-foreground h-2 w-2 animate-bounce rounded-full [animation-delay:-0.15s]" />
                    <span className="bg-muted-foreground h-2 w-2 animate-bounce rounded-full" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="border-border border-t px-3 py-3">
              {error && <p className="text-destructive mb-2 text-xs">{error}</p>}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                  }}
                  placeholder="Type your question…"
                  disabled={isLoading}
                  className="border-border focus:border-ring flex-1 rounded-xl border px-3 py-2 text-sm outline-none disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="bg-foreground text-background hover:bg-foreground/80 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-40"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
