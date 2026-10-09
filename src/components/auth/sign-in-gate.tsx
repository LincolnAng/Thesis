"use client";

import { useState } from "react";
import { useStore } from "@/lib/store/use-store";
import { hashPin, signIn, useCurrentUser } from "@/lib/auth/current-user";
import { CARD_GRADIENTS } from "@/lib/summary/item-icons";
import type { AppUser } from "@/lib/store/types";

/** Up to two letters, so a tile reads as a person rather than a word. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * "Who's using this?" — shown over the app until somebody on the shared device says who
 * they are, so every save can be stamped with a name.
 *
 * It only appears once people have been added in Settings. A shop that never sets anyone up
 * never sees it, which keeps this from becoming a wall in front of a one-person business.
 */
export function SignInGate({ children }: { children: React.ReactNode }) {
  const { users } = useStore();
  const user = useCurrentUser();
  const [picked, setPicked] = useState<AppUser | null>(null);
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(false);

  if (users.length === 0 || user) return <>{children}</>;

  async function submit(person: AppUser, digits: string) {
    const hash = await hashPin(person.id, digits);
    if (hash !== person.pinHash) {
      setWrong(true);
      setPin("");
      return;
    }
    signIn({ id: person.id, name: person.name, role: person.role });
  }

  function choose(person: AppUser) {
    setWrong(false);
    setPin("");
    // Nobody set a PIN for this person, so the name alone is the whole answer.
    if (!person.pinHash) {
      void submit(person, "");
      return;
    }
    setPicked(person);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ivory px-4 py-10">
      <div className={`w-full ${picked ? "max-w-[420px]" : "max-w-[640px]"}`}>
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cacao font-display text-xl font-bold text-ivory">
            M
          </div>
          <h1 className="font-display text-[30px] font-semibold">Who&apos;s using this?</h1>
        </div>

        {picked ? (
          <div className="rounded-2xl border border-line/15 bg-card p-7">
            <p className="mb-4 text-[14px] text-muted-foreground">
              Enter {picked.name}&apos;s 4-digit PIN.
            </p>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={pin}
              aria-invalid={wrong}
              onChange={(e) => {
                setWrong(false);
                setPin(e.target.value.replace(/\D/g, ""));
              }}
              onKeyDown={(e) => e.key === "Enter" && void submit(picked, pin)}
              className="w-full rounded-xl border border-input bg-transparent px-4 py-3 text-center font-display text-[28px] tracking-[0.5em]"
            />
            {wrong && <p className="mt-2 text-center text-[13px] text-danger">That PIN doesn&apos;t match. Try again.</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void submit(picked, pin)}
                disabled={pin.length < 4}
                className="flex-1 rounded-[10px] bg-cacao px-4 py-2.5 text-[14px] font-semibold text-ivory disabled:opacity-40"
              >
                Continue
              </button>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="rounded-[10px] border border-line/20 px-4 py-2.5 text-[14px] font-semibold"
              >
                Back
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mb-6 text-center text-[14px] text-muted-foreground">
              Tap your name. Everything you save gets your name on it, so the shop knows who did what.
            </p>
            {/* Tiles rather than a list of rows: this is the first thing anyone sees on a
                shared tablet, it is tapped with a thumb, and a face-sized target is quicker to
                hit than a line of text. */}
            <div className="flex flex-wrap items-start justify-center gap-5">
              {users.map((person, i) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => choose(person)}
                  className="group flex w-[128px] flex-col items-center gap-2.5"
                >
                  <span
                    className={`flex h-[128px] w-[128px] items-center justify-center rounded-2xl bg-gradient-to-br ${CARD_GRADIENTS[i % CARD_GRADIENTS.length]} font-display text-[44px] font-bold text-white/95 shadow-sm ring-0 transition group-hover:scale-[1.03] group-hover:ring-2 group-hover:ring-cacao/50 group-focus-visible:ring-2 group-focus-visible:ring-cacao`}
                  >
                    {initials(person.name)}
                  </span>
                  <span className="flex flex-col items-center">
                    <span className="text-[15px] font-semibold transition group-hover:text-cacao">{person.name}</span>
                    <span className="text-[12px] text-muted-foreground">
                      {person.role === "owner" ? "Owner" : "Helper"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
