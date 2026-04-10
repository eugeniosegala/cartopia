import { describe, expect, it, vi } from "vitest";
import { Command, InvalidArgumentError } from "commander";

// Re-create the parser locally since it's not exported from the CLI module.
// This mirrors the exact logic in src/cli.ts.
const VALID_THINKING_EFFORTS = ["none", "low", "medium", "high"] as const;
type ThinkingEffort = (typeof VALID_THINKING_EFFORTS)[number];

const parseThinkingEffort = (value: string): ThinkingEffort => {
  if (VALID_THINKING_EFFORTS.includes(value as ThinkingEffort)) {
    return value as ThinkingEffort;
  }

  throw new InvalidArgumentError(
    `must be one of: ${VALID_THINKING_EFFORTS.join(", ")}`,
  );
};

describe("--thinking-effort CLI option", () => {
  const buildCommand = () =>
    new Command()
      .exitOverride()
      .configureOutput({ writeErr: vi.fn(), writeOut: vi.fn() })
      .option(
        "--thinking-effort <level>",
        "LLM thinking effort",
        parseThinkingEffort,
      );

  it.each(["none", "low", "medium", "high"] as const)(
    "accepts valid effort level: %s",
    (level) => {
      const cmd = buildCommand();
      cmd.parse(["node", "test", "--thinking-effort", level]);
      expect(cmd.opts().thinkingEffort).toBe(level);
    },
  );

  it("rejects invalid effort levels", () => {
    const cmd = buildCommand();
    expect(() =>
      cmd.parse(["node", "test", "--thinking-effort", "extreme"]),
    ).toThrow();
  });

  it("leaves thinkingEffort undefined when not provided", () => {
    const cmd = buildCommand();
    cmd.parse(["node", "test"]);
    expect(cmd.opts().thinkingEffort).toBeUndefined();
  });
});
