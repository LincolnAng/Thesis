"use client";

import { useState } from "react";
import { useStore } from "@/lib/store/use-store";
import { hashPin, signIn, useCurrentUser } from "@/lib/auth/current-user";
import type { AppUser } from "@/lib/store/types";

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
    <div className="flex min-h-screen items-center justify-center bg-ivory px-4">
      <div className="w-full max-w-[420px] rounded-2xl border border-line/15 bg-white p-7">
        <div className="mb-1 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cacao font-display text-lg font-bold text-ivory">
            M
          </div>
          <h1 className="font-display text-[26px] font-semibold">Who&apos;s using this?</h1>
        </div>

        {picked ? (
          <>
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
          </>
        ) : (
          <>
            <p className="mb-4 text-[14px] text-muted-foreground">
              Tap your name. Everything you save gets your name on it, so the shop knows who did what.
            </p>
            <div className="flex flex-col gap-2">
              {users.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => choose(person)}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line/15 px-4 py-3 text-left transition hover:border-cacao/40"
                >
                  <span className="text-[15px] font-semibold">{person.name}</span>
                  <span className="text-[12px] text-muted-foreground">
                    {person.role === "owner" ? "Owner" : "Helper"}
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
