"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useTheme } from "next-themes";
import { ChevronDown, ChevronUp, Database, Download, ExternalLink, KeyRound, Languages, Moon, Sheet, Trash2, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getSnapshot, resetAllData, restoreLocalCollections, setApiKeyMissing } from "@/lib/store/store";
import type { BotLanguage } from "@/lib/sheets/settings";
import { cn } from "@/lib/utils";

const LANGUAGE_LABELS: Record<BotLanguage, string> = {
  english: "English",
  filipino: "Filipino",
  cebuano: "Cebuano",
};

interface SettingsState {
  hasKey: boolean;
  keyPreview: string | null;
  model: string | null;
  botLanguage: BotLanguage;
  spreadsheetUrl: string | null;
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editingKey, setEditingKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [modelDraft, setModelDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [languageSaving, setLanguageSaving] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // next-themes resolves the real theme synchronously on the client's first render
  // (to avoid a flash), which is already ahead of what the server rendered — so
  // "theme !== undefined" alone isn't hydration-safe. Gating on a mount flag that
  // only flips true in an effect (i.e. strictly after hydration) is the documented
  // fix for this exact library.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (!json.success) {
          setLoadError(true);
          return;
        }
        setSettings({
          hasKey: json.hasKey,
          keyPreview: json.keyPreview,
          model: json.model,
          botLanguage: json.botLanguage ?? "english",
          spreadsheetUrl: json.spreadsheetUrl ?? null,
        });
        setModelDraft(json.model ?? "");
        setEditingKey(!json.hasKey);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveKey() {
    if (!keyDraft.trim()) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: keyDraft.trim() }),
      });
      const json = await res.json();
      if (!json.success) {
        setSaveMessage("Couldn't save — check your Google Sheets setup and try again.");
        return;
      }
      setApiKeyMissing(false);
      setKeyDraft("");
      setEditingKey(false);
      setSaveMessage("Saved.");
      const refreshed = await fetch("/api/settings").then((r) => r.json());
      if (refreshed.success) {
        setSettings({
          hasKey: refreshed.hasKey,
          keyPreview: refreshed.keyPreview,
          model: refreshed.model,
          botLanguage: refreshed.botLanguage ?? "english",
          spreadsheetUrl: refreshed.spreadsheetUrl ?? null,
        });
      }
    } catch {
      setSaveMessage("Couldn't reach the server — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function saveLanguage(next: BotLanguage) {
    if (!settings) return;
    const previous = settings.botLanguage;
    setSettings({ ...settings, botLanguage: next }); // optimistic — feels instant, matches the dark mode toggle
    setLanguageSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botLanguage: next }),
      });
      const json = await res.json();
      if (!json.success) setSettings((s) => (s ? { ...s, botLanguage: previous } : s));
    } catch {
      setSettings((s) => (s ? { ...s, botLanguage: previous } : s));
    } finally {
      setLanguageSaving(false);
    }
  }

  async function saveModel() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelDraft.trim() || undefined }),
      });
      const json = await res.json();
      setSaveMessage(json.success ? "Saved." : "Couldn't save — try again.");
    } catch {
      setSaveMessage("Couldn't reach the server — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function exportBackup() {
    const snapshot = getSnapshot();
    const backup = {
      exportedAt: new Date().toISOString(),
      products: snapshot.products,
      rawMaterials: snapshot.rawMaterials,
      suppliers: snapshot.suppliers,
      socialStats: snapshot.socialStats,
      categoryBudgets: snapshot.categoryBudgets,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mang-kikos-cocoa-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importBackup(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result));
        restoreLocalCollections(parsed);
        setBackupMessage("Restored — products, stock, and suppliers are back from your backup file, and synced to Google Sheets.");
      } catch {
        setBackupMessage("Couldn't read that file — make sure it's a backup exported from this app.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="mb-1 text-xl font-bold text-foreground">Settings</h1>
      <p className="mb-4 text-sm text-muted-foreground">Manage how the AI assistant works.</p>

      <Card className="mb-4">
        <CardContent className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Moon className="h-4 w-4" /> Dark mode
          </span>
          {mounted && (
            <Switch checked={theme === "dark"} onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")} />
          )}
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Languages className="h-4 w-4" /> Bot language
          </span>
          {settings && (
            <select
              value={settings.botLanguage}
              disabled={languageSaving}
              onChange={(e) => saveLanguage(e.target.value as BotLanguage)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              {(Object.keys(LANGUAGE_LABELS) as BotLanguage[]).map((lang) => (
                <option key={lang} value={lang}>
                  {LANGUAGE_LABELS[lang]}
                </option>
              ))}
            </select>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" /> AI API key
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This lets Mang Kiko&apos;s Cocoa use AI to understand what you type and answer your questions. You&apos;ll
            need a Claude API key from Anthropic —{" "}
            <a
              href="https://console.anthropic.com/"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-dotted"
            >
              get one here
            </a>
            .
          </p>

          {loadError && (
            <p className="text-sm text-[var(--status-warning)]">
              Couldn&apos;t load your saved settings right now. You can still try saving a new key below.
            </p>
          )}

          {!editingKey && settings?.hasKey ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border p-2.5">
              <span className="text-sm text-foreground">
                Saved: <span className="font-mono">{settings.keyPreview}</span>
              </span>
              <Button size="sm" variant="secondary" onClick={() => setEditingKey(true)}>
                Change
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs">Claude API key</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  placeholder="sk-ant-..."
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  className="flex-1"
                />
                <Button size="sm" onClick={saveKey} disabled={saving || !keyDraft.trim()}>
                  Save
                </Button>
                {settings?.hasKey && (
                  <Button size="sm" variant="ghost" onClick={() => setEditingKey(false)}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )}

          {saveMessage && <p className="text-xs text-muted-foreground">{saveMessage}</p>}

          <Button
            size="sm"
            variant="ghost"
            className="w-full gap-1 text-xs text-muted-foreground"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showAdvanced ? "Hide advanced" : "Advanced"}
          </Button>

          {showAdvanced && (
            <div className={cn("space-y-2 border-t border-border pt-3")}>
              <Label className="text-xs">Model override</Label>
              <p className="text-xs text-muted-foreground">
                Leave blank to use the default. Only change this if you know what you&apos;re doing.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="claude-sonnet-5"
                  value={modelDraft}
                  onChange={(e) => setModelDraft(e.target.value)}
                  className="flex-1"
                />
                <Button size="sm" variant="secondary" onClick={saveModel} disabled={saving}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sheet className="h-4 w-4" /> Google Sheets
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Every sale, expense, product, ingredient, supplier, and budget is kept in sync with a Google
            Sheet — a readable, editable record of the whole business. Edits made directly in the sheet sync back
            here automatically within moments.
          </p>
          {settings?.spreadsheetUrl && (
            <a
              href={settings.spreadsheetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline decoration-dotted"
            >
              Open the spreadsheet <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" /> Business data backup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Download a file with your products, recipes, stock levels, and suppliers — a manual snapshot alongside
            the automatic Google Sheets sync above. Importing a file pushes its contents back up to Sheets too.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" className="gap-1" onClick={exportBackup}>
              <Download className="h-4 w-4" /> Export backup
            </Button>
            <Button size="sm" variant="secondary" className="gap-1" asChild>
              <label className="cursor-pointer">
                <Upload className="h-4 w-4" /> Import backup
                <input type="file" accept="application/json" className="hidden" onChange={importBackup} />
              </label>
            </Button>
          </div>
          {backupMessage && <p className="text-xs text-muted-foreground">{backupMessage}</p>}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-[var(--status-critical)]">
            <Trash2 className="h-4 w-4" /> Reset business data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Resets this device&apos;s view of products, recipes, stock levels, and suppliers back to the starting
            defaults. Since these now sync with Google Sheets, that reset syncs back within moments unless you also
            edit or delete the rows directly in the spreadsheet — open it above to do that. Your logged sales and
            expenses are never touched by this button.
          </p>
          {showResetConfirm ? (
            <div className="space-y-2 rounded-xl border border-[var(--status-critical)] bg-red-50 p-3 dark:bg-red-950/30">
              <p className="text-sm font-medium text-foreground">Are you sure? This can&apos;t be undone.</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    resetAllData();
                    setShowResetConfirm(false);
                  }}
                >
                  Yes, reset
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowResetConfirm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="destructive" onClick={() => setShowResetConfirm(true)}>
              Reset business data
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
