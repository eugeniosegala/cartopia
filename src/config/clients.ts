export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_MODEL = "google/gemini-3.1-pro-preview";
export const OPENROUTER_RETRY_DELAYS = [1000, 2000, 4000] as const;
export const OPENROUTER_MAX_RETRIES = OPENROUTER_RETRY_DELAYS.length;

export const TEXTRACT_MAX_ATTEMPTS = 5;

import type { ThinkingEffort } from "../types/pipeline.js";

export const TASK_THINKING_EFFORT: Record<string, ThinkingEffort> = {
  page_orientation: "medium",
  page_figures: "high",
  page_number: "low",
  reading_order: "high",
  page_translation: "high",
};

export const resolveThinkingEffort = (
  taskName: string,
  override?: ThinkingEffort,
): ThinkingEffort => override ?? TASK_THINKING_EFFORT[taskName] ?? "medium";
