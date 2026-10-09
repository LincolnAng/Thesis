"use client";

import { useState } from "react";
import { useStore } from "@/lib/store/use-store";
import { hashPin, signIn, useCurrentUser } from "@/lib/auth/current-user";
import { addUser } from "@/lib/store/store";
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
  const [addingName, setAddingName] = useState<string | null>(null);

  function addHelper() {
    const trimmed = (addingName ?? "").trim();
    if (!trimmed) return;
    addUser(trimmed, "", "helper");
    setAddingName(null);
  }

  if (user) return <>{children}</>;
  // Nobody set up yet. The gate used to wave everyone straight through here, which is why a
  // sign-in screen existed that nobody had ever seen: the only way to create the first person
  // was a Settings page you had to already know about.
  if (users.length === 0) return <FirstRun />;

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
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setAddingName("")}
                className="text-[13px] font-semibold text-cacao hover:underline"
              >
                Someone else works here
              </button>
            </div>
            {addingName !== null && (
              <div className="mx-auto mt-4 flex max-w-[360px] flex-col gap-2 rounded-2xl border border-line/15 bg-card p-4">
                <label className="text-xs text-muted-foreground">Their name</label>
                <input
                  autoFocus
                  value={addingName}
                  onChange={(e) => setAddingName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addHelper()}
                  placeholder="e.g. Jun"
                  className="h-10 rounded-lg border border-input bg-transparent px-3 text-[15px] outline-none focus:border-cacao"
                />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  They&apos;ll be able to log sales, purchases, batches and spoilage. Money and prices stay with the
                  owner. The owner can give them a PIN later under Settings.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={addHelper}
                    disabled={!addingName.trim()}
                    className="flex-1 rounded-[10px] bg-cacao px-4 py-2 text-[14px] font-semibold text-ivory disabled:opacity-40"
                  >
                    Add them
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingName(null)}
                    className="rounded-[10px] border border-line/20 px-4 py-2 text-[14px] font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The very first run: one name, and that person is the owner.
 *
 * Deliberately not a form. Everything else — PINs, helpers, roles — can be set later by
 * someone who now has somewhere to set it from.
 */
function FirstRun() {
  const [name, setName] = useState("");

  function start() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const created = addUser(trimmed, "", "owner");
    signIn({ id: created.id, name: created.name, role: "owner" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ivory px-4">
      <div className="w-full max-w-[420px] rounded-2xl border border-line/15 bg-card p-7 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-cacao font-display text-xl font-bold text-ivory">
          M
        </div>
        <h1 className="font-display text-[26px] font-semibold">What&apos;s your name?</h1>
        <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
          Everything you save gets your name on it. You can add the people who help you afterwards.
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && start()}
          placeholder="e.g. Auntie Sandy"
          className="mt-5 h-11 w-full rounded-xl border border-input bg-transparent px-4 text-center text-[16px] outline-none focus:border-cacao"
        />
        <button
          type="button"
          onClick={start}
          disabled={!name.trim()}
          className="mt-3 w-full rounded-[10px] bg-cacao px-4 py-2.5 text-[15px] font-semibold text-ivory disabled:opacity-40"
        >
          Start
        </button>
      </div>
    </div>
  );
}
