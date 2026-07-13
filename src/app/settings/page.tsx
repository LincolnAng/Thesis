"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { ChevronDown, ChevronUp, KeyRound, Moon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { setApiKeyMissing } from "@/lib/store/store";
import { cn } from "@/lib/utils";

interface SettingsState {
  hasKey: boolean;
  keyPreview: string | null;
  model: string | null;
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
        setSettings({ hasKey: json.hasKey, keyPreview: json.keyPreview, model: json.model });
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
        setSettings({ hasKey: refreshed.hasKey, keyPreview: refreshed.keyPreview, model: refreshed.model });
      }
    } catch {
      setSaveMessage("Couldn't reach the server — check your connection and try again.");
    } finally {
      setSaving(false);
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

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-8">
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
    </div>
  );
}
