/**
 * Which model answers a message. Most of what BAi does — logging a sale, looking up a figure,
 * a quick reply — doesn't need the biggest model, and paying for Opus on "thanks!" is waste.
 *
 *   quick     greetings, thanks, yes/no                         → Haiku
 *   standard  recording, lookups, short writing, most questions → Sonnet
 *   deep      advice, analysis, planning, long or open questions → Opus (or the model set in Settings)
 *
 * Pure (route-model.test.ts).
 */

export type Tier = "quick" | "standard" | "deep";

export const QUICK_MODEL = process.env.ANTHROPIC_QUICK_MODEL || "claude-haiku-5-5";
export const STANDARD_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
export const DEEP_MODEL = process.env.ANTHROPIC_ADVISOR_MODEL || "claude-opus-5-5";

const QUICK = /^\s*(hi+|hello|hey|yo|good (morning|afternoon|evening|night)|thanks?( you)?|thank u|ty|salamat( po)?|ok(ay)?|sige|noted|yes|no|oo|hindi|opo|done|nice|great|cool)\b[\s!.?👍🙏😊]*$/i;

// Asking for judgement, reasons, plans or research rather than a figure or a record.
const DEEP =
  /\b(why|should (i|we)|strategy|strategi[cz]|plan(ning)?|analy[sz]e|analysis|compare|comparison|forecast|predict|advice|advise|recommend|suggest(ion)?s?|improve|grow(th)?|expand|marketing|pricing strategy|business plan|pros and cons|trade-?offs?|what if|how (can|do) (i|we) (increase|reduce|improve|grow)|bakit|dapat ba|ano ang mas|mas maganda|payo|diskarte|ngano|unsa(y| ang) mas)\b/i;

export function tierFor(message: string): Tier {
  const text = message.trim();
  if (QUICK.test(text)) return "quick";
  if (text.length > 400 || DEEP.test(text)) return "deep";
  return "standard";
}

/** The model and how hard it thinks, for a tier. A model chosen in Settings is used for deep work. */
export function modelFor(tier: Tier, settingsModel?: string | null): { model: string; effort: "low" | "medium" | "high" } {
  if (tier === "quick") return { model: QUICK_MODEL, effort: "low" };
  if (tier === "deep") return { model: settingsModel || DEEP_MODEL, effort: "high" };
  return { model: STANDARD_MODEL, effort: "medium" };
}
