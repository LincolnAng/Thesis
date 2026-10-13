"use client";

import { ProductionScreen } from "@/components/production/production-screen";

/** The production plan by day. Same plan as Production, laid out on a calendar. */
export default function CalendarPage() {
  return <ProductionScreen section="calendar" />;
}
