"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera } from "lucide-react";
import { useStore } from "@/lib/store/use-store";
import { addUser, updateUser } from "@/lib/store/store";
import { hashPin, signIn, useCurrentUser } from "@/lib/auth/current-user";
import { setProfilePhoto, useProfilePhotos } from "@/lib/auth/profile-photos";
import { shrinkImage } from "@/lib/products/photos";
import { CARD_GRADIENTS } from "@/lib/summary/item-icons";
import type { AppUser } from "@/lib/store/types";

/**
 * "Who's using this?" — shown over the app until somebody says who they are, so every save
 * can be stamped with a name.
 *
 * Profiles are made here. Creating one used to mean typing a row into the Users sheet, which
 * is a detour through a spreadsheet to answer a question the screen is already asking — so
 * the screen asks it: a name and four digits, and you are in.
 *
 * The PIN is required and is not security. It stops two people sharing a tablet from saving
 * as each other; anyone who can open the spreadsheet can read every PIN in it. Saying so
 * plainly is better than a lock that is trusted further than it deserves.
 */

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Tile({
  person,
  index,
  photo,
  onPick,
  onPhoto,
}: {
  person: AppUser;
  index: number;
  photo: string | undefined;
  onPick: () => void;
  onPhoto: (file: File | undefined) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  // No PIN is a nudge, never a lock. Every profile that already existed was created without
  // one, and refusing those would have left the app with no way in at all — the person who
  // could add the PINs is behind the screen asking for them.
  const noPin = !person.pin && !person.pinHash;

  return (
    <div className="group flex w-[128px] flex-col items-center gap-2.5">
      <div className="relative">
        <button
          type="button"
          onClick={onPick}
          className={`flex h-[128px] w-[128px] items-center justify-center overflow-hidden rounded-2xl shadow-sm transition hover:scale-[1.03] hover:ring-2 hover:ring-cacao/50 ${
            photo ? "" : `bg-gradient-to-br ${CARD_GRADIENTS[index % CARD_GRADIENTS.length]}`
          }`}
        >
          {photo ? (
            <Image src={photo} alt="" width={128} height={128} className="h-full w-full object-cover" unoptimized />
          ) : (
            <span className="font-display text-[44px] font-bold text-white/95">{initials(person.name)}</span>
          )}
        </button>

        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            onPhoto(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          aria-label={`Change ${person.name}'s photo`}
          className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border border-line/15 bg-card text-muted-foreground opacity-0 transition hover:text-cacao group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Camera className="h-4 w-4" />
        </button>
      </div>

      <span className="flex flex-col items-center">
        <span className="text-[15px] font-semibold">{person.name}</span>
        {noPin && <span className="text-[11px] text-muted-foreground">No PIN yet</span>}
      </span>
    </div>
  );
}

/**
 * Name and four digits. No roles to choose and nothing optional, because every extra field
 * here is a question asked before anybody has seen the app.
 */
function NewProfile({ onDone, autoSignIn = false }: { onDone: () => void; autoSignIn?: boolean }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const ready = name.trim().length > 0 && pin.length === 4;

  function create() {
    if (!ready) return;
    const made = addUser(name.trim(), "");
    updateUser(made.id, { pin });
    if (autoSignIn) signIn({ id: made.id, name: made.name });
    setName("");
    setPin("");
    onDone();
  }

  return (
    <div className="mx-auto flex w-full max-w-[360px] flex-col gap-2 rounded-2xl border border-line/15 bg-card p-4">
      <label className="text-xs text-muted-foreground">Name</label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Auntie Sandy"
        className="h-10 rounded-lg border border-input bg-transparent px-3 text-[15px] outline-none focus:border-cacao"
      />
      <label className="mt-1 text-xs text-muted-foreground">Pick a 4-digit PIN</label>
      <input
        type="password"
        inputMode="numeric"
        maxLength={4}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
        onKeyDown={(e) => e.key === "Enter" && create()}
        placeholder="••••"
        className="h-10 rounded-lg border border-input bg-transparent px-3 text-center font-display text-[20px] tracking-[0.4em] outline-none focus:border-cacao"
      />
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        The PIN keeps two people on one tablet from saving as each other. It is not a password — anyone who can open
        your Google Sheet can read it.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={create}
          disabled={!ready}
          className="flex-1 rounded-[10px] bg-cacao px-4 py-2 text-[14px] font-semibold text-ivory disabled:opacity-40"
        >
          Create
        </button>
        <button type="button" onClick={onDone} className="rounded-[10px] border border-line/20 px-4 py-2 text-[14px] font-semibold">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function SignInGate({ children }: { children: React.ReactNode }) {
  const { users } = useStore();
  const user = useCurrentUser();
  const photos = useProfilePhotos();
  const [picked, setPicked] = useState<AppUser | null>(null);
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(false);
  const [creating, setCreating] = useState(false);

  // Nobody set up yet. A shop that has not set anyone up is not locked out of its own
  // app — it just has no name to stamp on things.
  if (user) return <>{children}</>;
  // A shop that has never added anyone is not locked out of its own app; it just has no name
  // to stamp on things until somebody makes a profile.
  if (users.length === 0 && !creating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ivory px-4">
        <div className="w-full max-w-[420px] rounded-2xl border border-line/15 bg-card p-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-cacao font-display text-xl font-bold text-ivory">
            M
          </div>
          <h1 className="font-display text-[26px] font-semibold">Make your profile</h1>
          <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
            Everything you save gets your name on it. You can add the people who help you afterwards.
          </p>
          <div className="mt-5 text-left">
            <NewProfile onDone={() => setCreating(false)} autoSignIn />
          </div>
        </div>
      </div>
    );
  }

  async function submit(person: AppUser, digits: string) {
    const entered = digits.trim();
    // Plain digits for rows typed into the sheet; the old hash is still accepted so anyone
    // set up before this change can still get in.
    const ok = person.pin ? entered === person.pin : person.pinHash === (await hashPin(person.id, entered));
    if (!ok) {
      setWrong(true);
      setPin("");
      return;
    }
    signIn({ id: person.id, name: person.name });
  }

  async function handlePhoto(person: AppUser, file: File | undefined) {
    if (!file) return;
    try {
      if (!setProfilePhoto(person.id, await shrinkImage(file))) {
        alert("Couldn't save the photo — this browser's storage is full.");
      }
    } catch {
      alert("That file couldn't be read as a photo — try a JPG or PNG.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ivory px-4 py-10">
      <div className={`w-full ${picked ? "max-w-[420px]" : "max-w-[680px]"}`}>
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cacao font-display text-xl font-bold text-ivory">
            M
          </div>
          <h1 className="font-display text-[30px] font-semibold">Who&apos;s using this?</h1>
        </div>

        {picked ? (
          <div className="rounded-2xl border border-line/15 bg-card p-7">
            <p className="mb-4 text-[14px] text-muted-foreground">{`Enter ${picked.name}'s 4-digit PIN.`}</p>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              aria-invalid={wrong}
              onChange={(e) => {
                setWrong(false);
                const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                setPin(digits);
                if (digits.length === 4) void submit(picked, digits);
              }}
              className="w-full rounded-xl border border-input bg-transparent px-4 py-3 text-center font-display text-[28px] tracking-[0.5em]"
            />
            {wrong && <p className="mt-2 text-center text-[13px] text-danger">That PIN doesn&apos;t match. Try again.</p>}
            <button
              type="button"
              onClick={() => {
                setPicked(null);
                setPin("");
                setWrong(false);
              }}
              className="mt-4 w-full rounded-[10px] border border-line/20 px-4 py-2.5 text-[14px] font-semibold"
            >
              Back
            </button>
          </div>
        ) : (
          <>
            <p className="mb-6 text-center text-[14px] text-muted-foreground">
              Tap your name. Everything you save gets your name on it, so the shop knows who did what.
            </p>
            <div className="flex flex-wrap items-start justify-center gap-5">
              {users.map((person, i) => (
                <Tile
                  key={person.id}
                  person={person}
                  index={i}
                  photo={photos[person.id]}
                  onPick={() => {
                    setWrong(false);
                    setPin("");
                    if (!person.pin && !person.pinHash) {
                      signIn({ id: person.id, name: person.name });
                      return;
                    }
                    setPicked(person);
                  }}
                  onPhoto={(file) => void handlePhoto(person, file)}
                />
              ))}
            </div>
            <div className="mt-7 flex flex-col items-center gap-3">
              {creating ? (
                <NewProfile onDone={() => setCreating(false)} />
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="text-[13px] font-semibold text-cacao hover:underline"
                >
                  + Create a profile
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
