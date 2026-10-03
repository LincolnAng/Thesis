/**
 * Is this question sharp enough to get a useful answer?
 *
 * A vague prompt produces a vague answer, and the owner has no way to recognise a vague answer
 * as a bad one — it still sounds confident and friendly. So the vagueness is caught before the
 * question is asked, and sharper versions are offered.
 *
 * Judged locally and for free. The gate BLOCKS: a question it judges too general does not reach
 * the advisor, because an answer to "help me with pricing" is a page of warm generalities that
 * reads exactly like good advice. There is no "send it anyway" — the way through is to be
 * specific, which is the entire point.
 *
 * The escape hatch is "Others": she adds her own words, and the moment the combined question
 * passes this test it goes straight through without being rewritten. So she can always ask what
 * she actually meant; she just cannot ask it vaguely. It never fires on a transaction log —
 * see classifyIntent.
 */

export interface Sharpness {
  sharp: boolean;
  /** Why it was judged vague, in the owner's words. Empty when sharp. */
  reasons: string[];
}

/** Words that stand in for a question instead of asking one. */
const VAGUE_OPENERS = [
  "help me with", "help with", "help me", "what about", "how about", "anything about",
  "tell me about", "something about", "any idea", "any ideas", "any advice", "thoughts on",
  "improve", "fix", "better", "optimize", "optimise", "check my", "look at my", "review my",
  "ano kaya", "ano ba", "paano kaya", "tulong", "ayusin",
];

/** A question that names one of these is already about something specific. */
const CONCRETE_ANCHORS = [
  "classic", "dark", "crunch", "jar", "jars", "batch", "december", "christmas", "pasko",
  "bazaar", "event", "customer", "supplier", "beans", "sugar", "oil", "label", "box",
  "january", "february", "march", "april", "may", "june", "july", "august", "september",
  "october", "november", "this month", "next month", "last month", "this week",
];

/** Asking for a decision, not a topic. These make a prompt answerable. */
const DECISION_WORDS = [
  "should i", "which", "how much", "how many", "when", "what price", "is it worth",
  "better to", "or ", "vs", "versus", "compare", "dapat ba", "alin", "magkano", "kailan",
];

const MIN_SHARP_WORDS = 6;

export function assessSharpness(raw: string): Sharpness {
  const text = raw.trim().toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const reasons: string[] = [];

  const namesSomething = CONCRETE_ANCHORS.some((a) => text.includes(a)) || /\d/.test(text);
  const asksDecision = DECISION_WORDS.some((d) => text.includes(d));
  const leansVague = VAGUE_OPENERS.some((v) => text.includes(v));

  if (words.length < MIN_SHARP_WORDS) reasons.push("it's very short, so I'd have to guess what you mean");
  if (leansVague && !asksDecision) reasons.push("it names a topic but not a decision");
  if (!namesSomething) reasons.push("it doesn't say which product, month or number you mean");

  // Any one of these is enough. The gate used to need two before it would speak up, which let
  // "how do i start exporting?" through — a question with no product, no number and no month in
  // it, whose answer could only ever be a textbook paragraph.
  const sharp = reasons.length === 0;
  return { sharp, reasons };
}
