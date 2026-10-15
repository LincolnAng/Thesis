"use client";

import { useState } from "react";
import { BookOpenCheck, MessageCircleQuestion } from "lucide-react";
import { ChocolateBarLogo } from "@/components/ui/chocolate-bar-logo";
import { ChatComposer } from "@/components/home/chat-composer";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";
import { useStore } from "@/lib/store/use-store";

export type ChatMode = "ask" | "log";

interface QuestionGroup {
  title: string;
  /** Money topics are hidden from employees, whose screens never receive those figures. */
  executiveOnly?: boolean;
  questions: string[];
}

/**
 * The start screen: BAi greets whoever is signed in, and does two things — Ask and Log.
 *
 * Ask shows example questions grouped by topic, so it is clear what BAi can help with; they
 * are examples, not a menu, and anything else can be typed. Log says how to describe what
 * happened in plain words: BAi reads it, fills in the details, and shows them for checking
 * before anything is saved. The old Sold / Paid / Made buttons are gone — the chat is the one
 * way in, and the Transactions page keeps the full records.
 */
export function ChatLanding({ onSubmit, disabled }: { onSubmit: (text: string, mode: ChatMode) => void; disabled?: boolean }) {
  const { products } = useStore();
  const user = useCurrentUser();
  const exec = isExecutive(user);
  const [mode, setMode] = useState<ChatMode>("ask");
  const [value, setValue] = useState("");

  const product = products[0]?.name ?? "Cacao Tablea 150g";
  const groups: QuestionGroup[] = [
    { title: "Sales", questions: ["How much did we sell today?", `How much did ${product} make this month?`, "Who are our top customers?"] },
    { title: "Expenses", executiveOnly: true, questions: ["What were our biggest expenses this month?", "How much did we spend on ingredients this month?"] },
    { title: "Profitability", executiveOnly: true, questions: ["How much did we earn after costs this month?", "Which product earns the most per piece?"] },
    { title: "Inventory", questions: ["Which products are running low?", "Which ingredients do we need to restock?"] },
    { title: "Production", questions: [`When should we make another batch of ${product}?`, "What should we produce this week?"] },
    { title: "Business summary", executiveOnly: true, questions: ["Give me a summary of this month", "How can we increase profit?"] },
  ];
  const logExamples = [
    `Sold 10 ${product} to Aling Nena for ₱1,500`,
    ...(exec ? ["Paid ₱850 for 5 kg of cacao beans"] : []),
    `Made a batch of 24 ${product}`,
    `3 ${product} spoiled`,
  ];

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed, mode);
    setValue("");
  }

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col items-center px-4">
      <div className="mb-1 flex items-center gap-3">
        <span className="flex items-center gap-1.5 rounded-xl bg-cacao/10 px-2.5 py-1.5">
          <ChocolateBarLogo className="h-7 w-6" />
          <span className="font-display text-[15px] font-bold text-cacao">BAi</span>
        </span>
        <h1 className="font-display text-[34px] font-semibold tracking-tight text-foreground">
          {user ? `Hello, ${user.name}` : "Hello"}
        </h1>
      </div>
      <p className="mb-6 text-base text-muted-foreground">Ask about the business, or log what happened.</p>

      <div className="mb-4 flex w-fit gap-1.5 rounded-[10px] bg-secondary p-1" role="tablist" aria-label="What do you want to do?">
        <ModeTab active={mode === "ask"} onClick={() => setMode("ask")} icon={<MessageCircleQuestion className="h-4 w-4" />} label="Ask" />
        <ModeTab active={mode === "log"} onClick={() => setMode("log")} icon={<BookOpenCheck className="h-4 w-4" />} label="Log" />
      </div>

      <ChatComposer
        value={value}
        onChange={setValue}
        onSubmit={() => submit(value)}
        disabled={disabled}
        autoFocus
        className="w-full"
        placeholder={mode === "ask" ? "Ask anything — about sales, stock, costs, or something else" : "Describe what happened, e.g. sold 10 to Aling Nena for ₱1,500"}
      />

      {mode === "ask" ? (
        <div className="mt-6 w-full space-y-4">
          <div className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-2">
            {groups
              .filter((g) => exec || !g.executiveOnly)
              .map((g) => (
                <div key={g.title} className="space-y-1.5">
                  <p className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">{g.title}</p>
                  {g.questions.map((q) => (
                    <button
                      key={q}
                      type="button"
                      disabled={disabled}
                      onClick={() => submit(q)}
                      className="block w-full rounded-xl border border-line/15 bg-card px-3.5 py-2.5 text-left text-[13px] transition hover:border-cacao/40 hover:bg-secondary/40 disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              ))}
          </div>
          <p className="text-center text-[13px] text-muted-foreground">
            These are examples — you can ask BAi anything. When records are missing, BAi says so instead of guessing.
          </p>
        </div>
      ) : (
        <div className="mt-6 w-full space-y-3 rounded-2xl border border-line/15 bg-card p-4">
          <p className="text-[14px] font-semibold">Say what happened, the way you&apos;d tell someone</p>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Include what it was, the product, how many, and the amount. BAi fills in the type, product, quantity, total
            and date, and shows them to you before anything is saved. If something is missing, it asks instead of guessing.
          </p>
          <div className="flex flex-wrap gap-2">
            {logExamples.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setValue(ex)}
                className="rounded-full border border-line/15 bg-ivory px-3 py-1.5 text-[12.5px] text-foreground transition hover:bg-secondary"
                title="Put this in the message box to edit"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ModeTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex min-h-10 items-center gap-1.5 rounded-lg px-5 py-2 text-[14px] ${active ? "bg-card font-semibold shadow-sm" : "font-medium text-muted-foreground"}`}
    >
      {icon}
      {label}
    </button>
  );
}
