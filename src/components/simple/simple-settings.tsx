"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { ExternalLink, FileDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useStore } from "@/lib/store/use-store";
import { ownerName, setOwnerName } from "@/lib/summary/business-config";
import { useSpreadsheetUrl } from "@/components/settings/spreadsheet-button";
import { AdvancedHint, SectionTitle } from "@/components/simple/simple-ui";
import type { BotLanguage } from "@/lib/sheets/settings";

/**
 * Settings in Simple mode: the four things an owner actually changes, in the words they'd
 * use to ask for them. Everything else — the AI key, the labor rate, backups, resetting —
 * stays in Advanced, where the words for it already exist.
 */

const LANGUAGES: { value: BotLanguage; label: string }[] = [
  { value: "english", label: "English" },
  { value: "filipino", label: "Filipino" },
  { value: "cebuano", label: "Bisaya" },
];

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line/15 bg-white px-5 py-4">
      <div className="min-w-0">
        <div className="text-[15px] font-semibold">{title}</div>
        {hint && <div className="text-[13px] text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SimpleSettings() {
  const { businessSettings } = useStore();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState(ownerName(businessSettings));
  const [language, setLanguage] = useState<BotLanguage>("english");
  const spreadsheet = useSpreadsheetUrl();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { botLanguage?: BotLanguage } | null) => {
        if (!cancelled && json?.botLanguage) setLanguage(json.botLanguage);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveLanguage(next: BotLanguage) {
    setLanguage(next);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botLanguage: next }),
    }).catch(() => {});
  }

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-6">
      <div className="flex flex-col gap-2.5">
        <SectionTitle>About you</SectionTitle>
        <Row title="What should I call you?" hint="This is the name on your home screen.">
          <Input
            className="h-9 w-44"
            placeholder="e.g. Auntie Sandy"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setOwnerName(name)}
            onKeyDown={(e) => e.key === "Enter" && setOwnerName(name)}
          />
        </Row>
        <Row title="What language should I answer in?" hint="Type to me in any of them — this is how I reply.">
          <select
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={language}
            onChange={(e) => void saveLanguage(e.target.value as BotLanguage)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </Row>
      </div>

      <div className="flex flex-col gap-2.5">
        <SectionTitle>Your records</SectionTitle>
        <Row
          title="Your spreadsheet"
          hint="Every sale, expense and product is written here too. Nothing is locked inside this app."
        >
          {spreadsheet ? (
            <div className="flex gap-2">
              <a
                href={spreadsheet}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-line/20 bg-white px-4 py-2.5 text-[13px] font-semibold"
              >
                Open it <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <a
                href={spreadsheet.replace(/\/edit.*$/, "") + "/export?format=xlsx"}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-line/20 bg-white px-4 py-2.5 text-[13px] font-semibold"
              >
                <FileDown className="h-3.5 w-3.5" /> Excel
              </a>
            </div>
          ) : (
            <span className="text-[13px] text-muted-foreground">Not connected yet</span>
          )}
        </Row>
      </div>

      <div className="flex flex-col gap-2.5">
        <SectionTitle>How it looks</SectionTitle>
        <Row title="Dark screen" hint="Easier on the eyes at night.">
          {mounted && <Switch checked={theme === "dark"} onCheckedChange={(on) => setTheme(on ? "dark" : "light")} />}
        </Row>
      </div>

      <AdvancedHint what="the AI key, your hourly rate, backups or a fresh start" />
    </div>
  );
}
