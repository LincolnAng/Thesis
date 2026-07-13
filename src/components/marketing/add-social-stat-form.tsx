"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addSocialStat } from "@/lib/store/store";
import { PLATFORMS } from "@/lib/marketing/social-derive";
import type { SocialStatEntry } from "@/lib/store/types";

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString();
}

export function AddSocialStatForm() {
  const [platform, setPlatform] = useState<SocialStatEntry["platform"]>("Facebook");
  const [weekOf, setWeekOf] = useState(new Date().toISOString().slice(0, 10));
  const [followers, setFollowers] = useState("");
  const [reach, setReach] = useState("");
  const [engagements, setEngagements] = useState("");

  function submit() {
    if (!followers && !reach && !engagements) return;
    addSocialStat({
      platform,
      weekOf: mondayOf(weekOf),
      followers: Number(followers) || 0,
      reach: Number(reach) || 0,
      engagements: Number(engagements) || 0,
    });
    setFollowers("");
    setReach("");
    setEngagements("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Log weekly social stats</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="col-span-2 space-y-1.5 sm:col-span-1">
          <Label className="text-xs">Platform</Label>
          <Select value={platform} onValueChange={(v) => setPlatform(v as SocialStatEntry["platform"])}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLATFORMS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Week of</Label>
          <Input type="date" value={weekOf} onChange={(e) => setWeekOf(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Followers</Label>
          <Input type="number" value={followers} onChange={(e) => setFollowers(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Reach</Label>
          <Input type="number" value={reach} onChange={(e) => setReach(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Engagements</Label>
          <Input type="number" value={engagements} onChange={(e) => setEngagements(e.target.value)} />
        </div>
        <Button className="col-span-2 sm:col-span-5" onClick={submit}>
          Add entry
        </Button>
      </CardContent>
    </Card>
  );
}
