import { FormEvent, useMemo, useRef, useState } from "react";
import { Bot, Headphones, Leaf, Send, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AssistantKind = "help" | "energy";
type Message = { id: number; role: "assistant" | "user"; text: string };

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

function answerHelp(question: string) {
  const q = question.toLowerCase();
  if (q.includes("mulai") || q.includes("belajar")) return "Buka menu Learning. TERAS akan menampilkan Current Learning dan langkah berikutnya berdasarkan enrollment serta progres yang tersimpan. Pilih aktivitas aktif, pelajari materi, lalu tandai selesai.";
  if (q.includes("upload") || q.includes("video") || q.includes("materi")) return "Instruktur dapat membuka Trainer Desk, memilih course dan revisi draft, lalu menambahkan resource terkelola. Unggah video/dokumen, periksa metadata dan preview, kemudian publish revisi agar terlihat oleh learner.";
  if (q.includes("readiness") || q.includes("kesiapan")) return "Readiness adalah status kesiapan internal berdasarkan learning, practice, evidence, review, remediation, dan reassessment. Readiness TERAS bukan keputusan kompeten dan bukan sertifikat resmi.";
  if (q.includes("evidence") || q.includes("bukti")) return "Buka Evidence dari aktivitas atau practice terkait. Evidence harus tetap terhubung ke learning activity dan practice attempt agar riwayatnya dapat ditelusuri.";
  if (q.includes("admin") || q.includes("enrollment") || q.includes("pengguna")) return "Admin Control Room digunakan untuk mengelola pengguna, peran, program, pathway, cohort, dan enrollment. Hak akses tetap ditentukan dan divalidasi oleh server.";
  if (q.includes("validator") || q.includes("verifikasi")) return "Validator menggunakan work queue untuk memeriksa validitas, relevansi, kecukupan, dan traceability evidence, kemudian memberi feedback atau membuka remediation sesuai kewenangan.";
  return "Saya belum menemukan panduan yang persis sama. Coba sebutkan menu atau prosesnya, misalnya Learning, upload materi, Evidence, Readiness, Trainer Desk, Validator, atau Admin.";
}

function answerEnergy(question: string) {
  const q = question.toLowerCase();
  if (q.includes("transisi energi")) return "Transisi energi adalah perubahan bertahap dari sistem energi berbasis emisi tinggi menuju sistem yang lebih bersih, efisien, aman, terjangkau, dan berkelanjutan. Perubahan ini mencakup teknologi, kebijakan, pembiayaan, infrastruktur, dan kesiapan tenaga kerja.";
  if (q.includes("teras")) return "TERAS Academy membantu peserta membangun pengetahuan, practice, evidence, dan readiness sebelum mengikuti asesmen resmi dari Lembaga Sertifikasi. TERAS bukan Lembaga Sertifikasi dan tidak menerbitkan keputusan kompeten.";
  if (q.includes("kompetensi") || q.includes("kapabilitas")) return "Teknologi energi bersih harus dipasang, dioperasikan, dan dipelihara secara aman. Kompetensi membuktikan kemampuan pada standar tertentu; kapabilitas mencakup kemampuan menerapkan pengetahuan, keterampilan, perilaku, dan evidence dalam konteks kerja.";
  if (q.includes("surya") || q.includes("solar") || q.includes("pv")) return "Solar PV mengubah energi matahari menjadi listrik. Kesiapan teknisi mencakup keselamatan listrik, desain, pemasangan, pengujian, commissioning, dokumentasi, dan kemampuan menindaklanjuti temuan.";
  if (q.includes("adil") || q.includes("berkeadilan")) return "Transisi yang berkeadilan memastikan manfaat dan risiko perubahan energi dibagi secara adil, termasuk akses pelatihan, perlindungan pekerja, kesempatan kerja baru, dan perhatian pada komunitas terdampak.";
  return "Topik yang dapat saya bantu antara lain transisi energi, energi surya, kesiapan tenaga kerja, kompetensi, kapabilitas, keselamatan, dan peran TERAS dalam persiapan sertifikasi.";
}

function ChatPanel({ kind, onClose }: { kind: AssistantKind; onClose: () => void }) {
  const copy = assistantCopy[kind];
  const Icon = copy.icon;
  const nextId = useRef(1);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: "assistant", text: copy.greeting },
  ]);

  const respond = (question: string) => {
    const clean = question.trim();
    if (!clean) return;
    const answer = kind === "help" ? answerHelp(clean) : answerEnergy(clean);
    const id = nextId.current;
    nextId.current += 2;
    setMessages((current) => [
      ...current,
      { id, role: "user", text: clean },
      { id: id + 1, role: "assistant", text: answer },
    ]);
    setInput("");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    respond(input);
  };

  return (
    <section
      className="fixed bottom-24 right-4 z-50 flex h-[min(34rem,calc(100dvh-8rem))] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl md:right-6"
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
            <p className={cn(
              "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
              message.role === "assistant" ? "rounded-tl-sm bg-muted" : "rounded-tr-sm bg-primary text-primary-foreground",
            )}>
              {message.text}
            </p>
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
          <Input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Tulis pertanyaan..." aria-label={`Pertanyaan untuk ${copy.title}`} />
          <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Kirim pertanyaan">
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
      <div className="fixed bottom-4 right-4 z-50 flex items-end gap-2 md:right-6">
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
                "h-12 rounded-full px-4 shadow-xl transition-transform hover:-translate-y-0.5",
                kind === "energy" && "bg-emerald-600 text-white hover:bg-emerald-700",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="hidden sm:inline">{kind === "help" ? "Help Desk" : "TERAS & Energi"}</span>
            </Button>
          );
        })}
      </div>
    </>
  );
}