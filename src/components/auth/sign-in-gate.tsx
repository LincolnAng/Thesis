"use client";

import { ROLE_LABELS } from "@/lib/auth/roles";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera } from "lucide-react";
import { ChocolateBarLogo } from "@/components/ui/chocolate-bar-logo";
import { adoptSignedInProfile, signInWithPin, useCurrentUser, verifySession } from "@/lib/auth/current-user";
import { setProfilePhoto, useProfilePhotos } from "@/lib/auth/profile-photos";
import { profileColor } from "@/lib/auth/profile-colors";
import { shrinkImage } from "@/lib/products/photos";
import type { AppUser } from "@/lib/store/types";

/**
 * "Who's using this?" — Netflix-style: pick your profile, enter your PIN, and the server signs
 * this device in as you. Shown over the app until somebody has, so every save is stamped with
 * a name and every screen shows only what that profile's role allows.
 *
 * The profile list comes from the server, so a profile made on one device is on every device.
 * The PIN is checked there too, and never reaches this page. It is still not a password: it
 * keeps two people on one tablet apart, and anyone with access to the Google Sheet can see
 * everything in it.
 *
 * There is no screen for adding profiles now that People is gone. The one exception is the very
 * first profile, which is how a new shop gets in at all.
 */

const ROLE_LABEL: Record<AppUser["role"], string> = ROLE_LABELS;

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

  return (
    <div className="group flex w-[128px] flex-col items-center gap-2.5">
      <div className="relative">
        <button
          type="button"
          onClick={onPick}
          style={photo ? undefined : { background: profileColor(person.color, index) }}
          className="flex h-[128px] w-[128px] items-center justify-center overflow-hidden rounded-2xl shadow-sm transition hover:scale-[1.03] hover:ring-2 hover:ring-cacao/50"
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
          className="absolute -bottom-1 -right-1 flex h-11 w-11 items-center justify-center rounded-full border border-line/15 bg-card text-muted-foreground opacity-0 transition hover:text-cacao group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Camera className="h-4 w-4" />
        </button>
      </div>

      <span className="flex flex-col items-center">
        <span className="text-[15px] font-semibold">{person.name}</span>
        <span className="text-[11px] text-muted-foreground">
          {ROLE_LABEL[person.role]}
          {!person.hasPin && " · No PIN yet"}
        </span>
      </span>
    </div>
  );
}

/** The first profile: the owner's, so it is an executive, and the server signs them in. */
function FirstProfile() {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const ready = name.trim().length > 0 && pin.length === 4 && !saving;

  async function create() {
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), pin }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.reason === "forbidden" ? "Someone already set this shop up — refresh to see their profile." : "Couldn't save that. Check your connection and try again.");
        setSaving(false);
        return;
      }
      adoptSignedInProfile({ id: json.profile.id, name: json.profile.name, role: json.profile.role });
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[360px] flex-col gap-2 rounded-2xl border border-line/15 bg-card p-4">
      <label className="text-xs text-muted-foreground" htmlFor="first-name">Name</label>
      <input
        id="first-name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Auntie Sandy"
        className="h-11 rounded-lg border border-input bg-transparent px-3 text-[15px] outline-none focus:border-cacao"
      />
      <label className="mt-1 text-xs text-muted-foreground" htmlFor="first-pin">Pick a 4-digit PIN</label>
      <input
        id="first-pin"
        type="password"
        inputMode="numeric"
        maxLength={4}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
        onKeyDown={(e) => e.key === "Enter" && void create()}
        placeholder="••••"
        className="h-11 rounded-lg border border-input bg-transparent px-3 text-center font-display text-[20px] tracking-[0.4em] outline-none focus:border-cacao"
      />
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        You&apos;ll be an Executive, with full access. The PIN keeps people sharing a tablet apart — it is not a password,
        and anyone with access to your Google Sheet can see your records.
      </p>
      {error && <p className="text-[13px] text-danger">{error}</p>}
      <button
        type="button"
        onClick={() => void create()}
        disabled={!ready}
        className="min-h-11 rounded-[10px] bg-cacao px-4 py-2 text-[14px] font-semibold text-ivory disabled:opacity-40"
      >
        {saving ? "Setting up…" : "Create"}
      </button>
    </div>
  );
}

export function SignInGate({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const photos = useProfilePhotos();
  const [profiles, setProfiles] = useState<AppUser[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [picked, setPicked] = useState<AppUser | null>(null);
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (user) {
      void verifySession();
      return;
    }
    let cancelled = false;
    fetch("/api/auth/profiles")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success) setProfiles(json.profiles as AppUser[]);
        else setLoadFailed(true);
      })
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (user) return <>{children}</>;

  if (loadFailed) {
    return (
      <Centered>
        <h1 className="font-display text-[26px] font-semibold">Can&apos;t reach the shop&apos;s records</h1>
        <p className="mt-2 text-[14px] text-muted-foreground">Check the internet connection, then try again.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-5 min-h-11 rounded-[10px] bg-cacao px-5 text-[14px] font-semibold text-ivory">
          Try again
        </button>
      </Centered>
    );
  }

  if (profiles === null) {
    return (
      <Centered>
        <p className="text-[14px] text-muted-foreground">Loading profiles…</p>
      </Centered>
    );
  }

  if (profiles.length === 0) {
    return (
      <Centered>
        <h1 className="font-display text-[26px] font-semibold">Make your profile</h1>
        <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
          Everything you save gets your name on it.
        </p>
        <div className="mt-5 text-left">
          <FirstProfile />
        </div>
      </Centered>
    );
  }

  async function submit(person: AppUser, digits: string) {
    setChecking(true);
    const result = await signInWithPin(person.id, digits);
    if (result.ok) return; // the page reloads signed in
    setChecking(false);
    setPin("");
    setMessage(
      result.reason === "wrong_pin"
        ? "That PIN doesn't match. Try again."
        : result.reason === "locked"
          ? `Too many tries. Wait ${result.retryInSeconds ?? 60} seconds and try again.`
          : "Couldn't sign in. Check your connection and try again.",
    );
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
          <ChocolateBarLogo className="h-12 w-[38px]" />
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
              disabled={checking}
              aria-invalid={Boolean(message)}
              onChange={(e) => {
                setMessage(null);
                const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                setPin(digits);
                if (digits.length === 4) void submit(picked, digits);
              }}
              className="w-full rounded-xl border border-input bg-transparent px-4 py-3 text-center font-display text-[28px] tracking-[0.5em]"
            />
            {message && <p className="mt-2 text-center text-[13px] text-danger">{message}</p>}
            <button
              type="button"
              onClick={() => {
                setPicked(null);
                setPin("");
                setMessage(null);
              }}
              className="mt-4 min-h-11 w-full rounded-[10px] border border-line/20 px-4 py-2.5 text-[14px] font-semibold"
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
              {profiles.map((person, i) => (
                <Tile
                  key={person.id}
                  person={person}
                  index={i}
                  photo={photos[person.id]}
                  onPick={() => {
                    setMessage(null);
                    setPin("");
                    // No PIN is a nudge, never a lock: profiles from before PINs were required
                    // would otherwise have no way in. The server still signs them in properly.
                    if (!person.hasPin) {
                      void submit(person, "");
                      return;
                    }
                    setPicked(person);
                  }}
                  onPhoto={(file) => void handlePhoto(person, file)}
                />
              ))}
            </div>
            <p className="mt-7 text-center text-[12px] text-muted-foreground">
              Not here? Ask an Executive to add you.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ivory px-4">
      <div className="w-full max-w-[420px] rounded-2xl border border-line/15 bg-card p-7 text-center">
        <ChocolateBarLogo className="mx-auto mb-4 h-12 w-[38px]" />
        {children}
      </div>
    </div>
  );
}
