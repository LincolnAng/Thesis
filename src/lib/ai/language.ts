import type { BotLanguage } from "@/lib/sheets/settings";

/**
 * How BAi should write in each language the Settings "Bot language" offers — one wording, used by
 * every AI feature that writes words the owner reads, so they can't drift apart.
 *
 * "Reply in Filipino" on its own gets textbook Tagalog: stiff, formal, and full of words nobody
 * says at a bazaar. What she reads should sound the way she and her buyers actually talk and text,
 * with the business words people normally say in English left in English.
 */
const RULES: Record<BotLanguage, string> = {
  english: "Write in plain, simple English — short sentences, everyday words, no jargon.",
  filipino:
    "Write in everyday Filipino (Tagalog), the conversational way people in the Philippines actually talk and text — not formal or textbook Tagalog. " +
    "Keep the business and food words people normally say in English in English (stock, order, batch, supplier, jar, bazaar, budget, sales, cost). " +
    "Don't write whole sentences in English, and never switch to Cebuano.",
  cebuano:
    "Write in everyday Cebuano (Bisaya), the conversational way people in Cebu and Mindanao actually talk and text — not formal or deep Bisaya. " +
    "Keep the business and food words people normally say in English in English (stock, order, batch, supplier, jar, bazaar, budget, sales, cost). " +
    "Don't write whole sentences in English, and never switch to Tagalog.",
};

/** The instruction for one language. Numbers, ₱ amounts, dates and product names stay as they are. */
export function languageRule(language: BotLanguage): string {
  return `${RULES[language] ?? RULES.english} Keep numbers, ₱ amounts, dates and product names exactly as given.`;
}

const NAMES: Record<BotLanguage, string> = { english: "English", filipino: "Filipino (Tagalog)", cebuano: "Cebuano (Bisaya)" };

/**
 * For the chat: answer in whatever language the person just wrote in — English, Tagalog, Bisaya
 * or a mix like Taglish — the way they wrote it. The Settings language is only the fallback,
 * for a message with no language to go on (a number, a name).
 */
export function matchLanguageRule(fallback: BotLanguage): string {
  return (
    "LANGUAGE: Reply in the same language the person used in their latest message, matching how they write — English, everyday Tagalog, everyday Bisaya, or the same mix (Taglish, Bislish) if they mixed. " +
    "If they switch language, switch with them. Use conversational wording, not formal or textbook, and keep business words people normally say in English in English (stock, order, batch, supplier, sales, cost). " +
    `If the message gives nothing to go on (just a number or a name), reply in ${NAMES[fallback] ?? "English"}. Keep numbers, ₱ amounts, dates and product names exactly as given.`
  );
}
