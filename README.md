# Mani Sarap — Business Tracker

A mobile-first business management dashboard for a small Filipino peanut butter spread producer. Built with Next.js (App Router), Tailwind CSS, and shadcn/ui.

## Core idea

The home page is a single large text box. The owner types anything in English, Tagalog, or Taglish (e.g. *"Nabenta 12 jars kay Aling Nena, wholesale, ₱1,800"*), and it's auto-categorized into the right module: Sales, Expenses, Inventory, Waste, etc.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## AI setup (optional)

Auto-categorization and the AI chatbot use the Anthropic API. Copy `.env.example` to `.env.local` and set:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

Without a key, the app runs fully in **manual mode** — the home page falls back to a manual entry form and the chatbot answers from local data only. Nothing breaks.

## Data storage

All business data (entries, products, suppliers, budgets, etc.) is stored in the browser's `localStorage` via a small custom store (`src/lib/store`). There is no backend database in this MVP — data is per-browser.

## Modules

Home (smart entry) · Dashboard · Finance (pricing calculator) · Inventory · Sales · Expenses/Budget · Operations · Marketing · Sustainability · Suppliers — plus a floating AI assistant.

## Deploy

Deploy to [Vercel](https://vercel.com/new). Set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`) as environment variables in the Vercel project settings.
