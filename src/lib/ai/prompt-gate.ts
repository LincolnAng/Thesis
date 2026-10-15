/**
 * Is this question sharp enough to get a useful answer?
 *
 * A request that names a topic without asking anything ("help me with pricing") gets a page of
 * warm generalities that reads exactly like good advice. When that is what she typed, the chat
 * offers sharper versions written against her own products and figures.
 *
 * It no longer blocks, and it no longer judges length or vocabulary. It used to require six
 * words and one of a fixed list of product names and months, so "what's the weather in Japan?"
 * or any question about tablea, ice cream or biko was stopped before anything could answer it.
 * BAi takes any question now: only a topic-with-no-question is flagged, and even then "Ask as I
 * wrote it" sends her words unchanged. Judged locally and for free; it never fires on a
 * transaction log — see classifyIntent.
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

/** Asking for a decision, not a topic. These make a prompt answerable. */
const DECISION_WORDS = [
  "should i", "which", "how much", "how many", "when", "what price", "is it worth",
  "better to", "or ", "vs", "versus", "compare", "dapat ba", "alin", "magkano", "kailan",
];

export function assessSharpness(raw: string): Sharpness {
  const text = raw.trim().toLowerCase();
  const asksDecision = DECISION_WORDS.some((d) => text.includes(d)) || text.includes("?");
  const leansVague = VAGUE_OPENERS.some((v) => text.includes(v));
  // Only a topic with no question in it is flagged: "help me with pricing", "any advice".
  if (leansVague && !asksDecision) {
    return { sharp: false, reasons: ["it names a topic but not a decision"] };
  }
  return { sharp: true, reasons: [] };
}
