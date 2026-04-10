import { describe, expect, it } from "vitest";
import {
  TASK_THINKING_EFFORT,
  resolveThinkingEffort,
} from "../../src/config/clients.js";

describe("TASK_THINKING_EFFORT", () => {
  it("assigns expected defaults per task", () => {
    expect(TASK_THINKING_EFFORT.page_orientation).toBe("medium");
    expect(TASK_THINKING_EFFORT.page_figures).toBe("high");
    expect(TASK_THINKING_EFFORT.page_number).toBe("low");
    expect(TASK_THINKING_EFFORT.reading_order).toBe("high");
    expect(TASK_THINKING_EFFORT.page_translation).toBe("high");
  });
});

describe("resolveThinkingEffort", () => {
  it("returns the task default when no override is given", () => {
    expect(resolveThinkingEffort("page_number")).toBe("low");
    expect(resolveThinkingEffort("page_translation")).toBe("high");
  });

  it("returns the override when provided", () => {
    expect(resolveThinkingEffort("page_number", "high")).toBe("high");
    expect(resolveThinkingEffort("page_translation", "none")).toBe("none");
  });

  it("falls back to medium for unknown task names", () => {
    expect(resolveThinkingEffort("unknown_task")).toBe("medium");
  });

  it("prefers override even for unknown tasks", () => {
    expect(resolveThinkingEffort("unknown_task", "low")).toBe("low");
  });
});
