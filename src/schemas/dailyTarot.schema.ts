// src/schemas/dailyTarot.schema.ts

import { z } from "zod";

/**
 * Daily Tarot Card Schema
 * Validates and normalizes tarot card output from Gemini + cache.
 */
export const DailyTarotSchema = z.object({
  cardNumber: z
    .number()
    .int()
    .nonnegative(),

  reversed: z.boolean(),

  // Strict date validation: YYYY-MM-DD
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (expected YYYY-MM-DD)"),

  // timezone must be a non-empty string (IANA)
  timezone: z
    .string()
    .min(1, "timezone required"),

  timestamp: z
    .number()
    .int()
});

export type DailyTarot = z.infer<typeof DailyTarotSchema>;