/**
 * Which model answers a message. Admin work — logging a sale or expense, looking up a figure,
 * a quick reply — runs on Haiku, many times a day, for a fraction of the cost. Everything else
 * — advice, analysis, planning, writing, general questions — gets Opus.
 *
 *   admin  greetings, thanks, yes/no, recording, edits, lookups of a figure → Haiku
 *   deep   everything else                                                → Opus (or the model set in Settings)
 *
 * When unsure it's deep: a wrong answer to a real question costs more than a few centavos.
 *
 * Pure (route-model.test.ts).
 */

export type Tier = "admin" | "deep";

export const QUICK_MODEL = process.env.ANTHROPIC_QUICK_MODEL || "claude-haiku-5-5";
export const DEEP_MODEL = process.env.ANTHROPIC_ADVISOR_MODEL || "claude-opus-5-5";

const QUICK = /^\s*(hi+|hello|hey|yo|good (morning|afternoon|evening|night)|thanks?( you)?|thank u|ty|salamat( po)?|ok(ay)?|sige|noted|yes|no|oo|hindi|opo|done|nice|great|cool)\b[\s!.?👍🙏😊]*$/i;

// Asking for judgement, reasons, plans, research or writing rather than a figure or a record.
const DEEP =
  /\b(why|should (i|we)|strategy|strategi[cz]|plan(ning)?|analy[sz]e|analysis|compare|comparison|forecast|predict|advice|advise|recommend|suggest(ion)?s?|improve|grow(th)?|expand|marketing|pricing strategy|business plan|pros and cons|trade-?offs?|what if|explain|write|draft|caption|post|letter|message to|how (can|do|should) (i|we)|bakit|dapat ba|ano ang mas|mas maganda|payo|diskarte|ngano|unsa(y| ang) mas|isulat|sulat)\b/i;

// Recording, changing or looking up the shop's own records — in English, Tagalog or Bisaya.
const ADMIN =
  /\b(log|record|add|enter|sold|sell|sale|bought|buy|purchased?|paid|pay|spent|expense|received?|deliver(ed|y)?|returned?|spoil(ed|age)?|wasted?|restock(ed)?|stock|order(ed)?|time (in|out)|delete|remove|undo|edit|change|update|fix|how (much|many)|what('s| is) (my|our|the (total|stock|balance|price|cost))|show( me)?|list|total|balance|benta|nabenta|binenta|bumili|binili|bayad|binayaran|nagbayad|gastos|gumastos|utang|magkano|ilan|palit|gipalit|gibaligya|baligya|nagasto|pila|tagpila)\b/i;

export function tierFor(message: string): Tier {
  const text = message.trim();
  if (QUICK.test(text)) return "admin";
  if (text.length > 400 || DEEP.test(text)) return "deep";
  // "Nena 3 tablea 450" — a short line with figures in it is a record being typed.
  if (ADMIN.test(text) || (/\d/.test(text) && text.length <= 120)) return "admin";
  return "deep";
}

/** The model and how hard it thinks, for a tier. A model chosen in Settings is used for deep work. */
export function modelFor(tier: Tier, settingsModel?: string | null): { model: string; effort: "low" | "medium" | "high" } {
  if (tier === "admin") return { model: QUICK_MODEL, effort: "low" };
  return { model: settingsModel || DEEP_MODEL, effort: "high" };
}
