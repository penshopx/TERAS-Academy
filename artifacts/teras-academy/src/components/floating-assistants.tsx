import { FormEvent, useMemo, useRef, useState } from "react";
import { Bot, Headphones, Leaf, Send, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useSearchAssistantKnowledge } from "@workspace/api-client-react";

type AssistantKind = "help" | "energy";
type Message = { id: number; role: "assistant" | "user"; text: string; citations?: Array<{ title: string; version: number }> };

const assistantCopy = {
  help: {
    title: "TERAS Help Desk",
    subtitle: "Panduan penggunaan aplikasi",
    icon: Headphones,
    greeting: "Halo! Saya dapat membantu Anda menggunakan TERAS Academy. Pilih pertanyaan cepat atau tuliskan kendala Anda.",
    prompts: ["Bagaimana mulai belajar?", "Bagaimana upload video?", "Apa arti Readiness?"],
  },
  energy: {
    title: "TERAS Energy Assistant",
    subtitle: "TERAS & Transisi Energi",
    icon: Leaf,
    greeting: "Halo! Mari mengenal TERAS, kapabilitas tenaga kerja, dan transisi energi yang aman serta berkeadilan.",
    prompts: ["Apa itu transisi energi?", "Apa peran TERAS?", "Mengapa kompetensi penting?"],
  },
} as const;
function ChatPanel({ kind, onClose }: { kind: AssistantKind; onClose: () => void }) {
  const copy = assistantCopy[kind];
  const Icon = copy.icon;
  const nextId = useRef(1);
  const [input, setInput] = useState("");
  const knowledge = useSearchAssistantKnowledge();
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: "assistant", text: copy.greeting },
  ]);

  const respond = (question: string) => {
    const clean = question.trim();
    if (!clean) return;
    const id = nextId.current;
    nextId.current += 2;
    setMessages((current) => [
      ...current,
      { id, role: "user", text: clean },
    ]);
    knowledge.mutate({ data: { category: kind, question: clean } }, {
      onSuccess: (result) => setMessages((current) => [...current, { id: id + 1, role: "assistant", text: result.answer, citations: result.citations }]),
      onError: () => setMessages((current) => [...current, { id: id + 1, role: "assistant", text: "Maaf, pengetahuan TERAS sedang tidak dapat dimuat. Silakan coba lagi." }]),
    });
    setInput("");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    respond(input);
  };

  return (
    <section
      className={cn(
        "fixed bottom-24 z-50 flex h-[min(34rem,calc(100dvh-8rem))] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl",
        kind === "help" ? "left-4 md:left-6" : "right-4 md:right-6",
      )}
      aria-label={copy.title}
    >
      <header className="flex items-center gap-3 border-b border-border bg-primary px-4 py-3 text-primary-foreground">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-foreground/15">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-bold">{copy.title}</h2>
          <p className="truncate text-xs opacity-80">{copy.subtitle}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={`Tutup ${copy.title}`} className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground">
          <X className="h-5 w-5" />
        </Button>
      </header>

      <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={cn("flex gap-2", message.role === "user" && "justify-end")}>
            {message.role === "assistant" && <Bot className="mt-1 h-4 w-4 shrink-0 text-primary" />}
            <div className={cn(
              "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
              message.role === "assistant" ? "rounded-tl-sm bg-muted" : "rounded-tr-sm bg-primary text-primary-foreground",
            )}>
              {message.text}
              {message.citations?.length ? <p className="mt-2 border-t border-border/50 pt-2 text-xs text-muted-foreground">Rujukan: {message.citations.map(citation => `${citation.title} (v${citation.version})`).join(", ")}</p> : null}
            </div>
            {message.role === "user" && <User className="mt-1 h-4 w-4 shrink-0 text-primary" />}
          </div>
        ))}
      </div>

      <div className="border-t border-border p-3">
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {copy.prompts.map((prompt) => (
            <button key={prompt} type="button" onClick={() => respond(prompt)} className="shrink-0 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {prompt}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="flex gap-2">
          <Input value={input} onChange={(event) => setInput(event.target.value)} placeholder={knowledge.isPending ? "Mencari panduan terbit…" : "Tulis pertanyaan..."} aria-label={`Pertanyaan untuk ${copy.title}`} disabled={knowledge.isPending} />
          <Button type="submit" size="icon" disabled={!input.trim() || knowledge.isPending} aria-label="Kirim pertanyaan">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </section>
  );
}

export function FloatingAssistants() {
  const [active, setActive] = useState<AssistantKind | null>(null);
  const assistants = useMemo(() => (["help", "energy"] as const), []);

  return (
    <>
      {active && <ChatPanel key={active} kind={active} onClose={() => setActive(null)} />}
      {assistants.map((kind) => {
          const copy = assistantCopy[kind];
          const Icon = copy.icon;
          const selected = active === kind;
          return (
            <Button
              key={kind}
              type="button"
              onClick={() => setActive(selected ? null : kind)}
              aria-label={selected ? `Tutup ${copy.title}` : `Buka ${copy.title}`}
              aria-expanded={selected}
              className={cn(
                "fixed bottom-4 z-50 h-12 rounded-full px-4 shadow-xl transition-transform hover:-translate-y-0.5",
                kind === "help" ? "left-4 md:left-6" : "right-4 md:right-6",
                kind === "energy" && "bg-emerald-600 text-white hover:bg-emerald-700",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="hidden sm:inline">{kind === "help" ? "Help Desk" : "TERAS & Energi"}</span>
            </Button>
          );
        })}
    </>
  );
}
