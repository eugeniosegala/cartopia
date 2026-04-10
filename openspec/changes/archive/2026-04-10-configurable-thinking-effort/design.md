## Context

All five LLM call sites (`orientation`, `figures`, `page-number`, `reading-order`, `translation`) share identical model parameters through `callOpenRouter`: temperature 0, no token budget, no reasoning controls. The pipeline uses Gemini 3.1 Pro via OpenRouter, which supports thinking budget configuration through provider-specific parameters. Currently, simple classification tasks (page number detection) and complex reasoning tasks (translation with cross-page context) receive the same treatment.

The `CompletionOptions` interface already has an unused `maxTokens` field, establishing precedent for optional per-call parameter overrides. Config is centralized in `src/config/clients.ts` with task-specific thresholds living in their respective config files (e.g., `ORIENTATION_LLM_MIN_CONFIDENCE` in `src/config/image.ts`).

## Goals / Non-Goals

**Goals:**
- Allow each pipeline task to specify a thinking effort level that controls model reasoning depth
- Provide sensible per-task defaults that optimize the cost/quality tradeoff
- Expose a CLI flag for users to override the global effort level
- Keep the implementation model-agnostic so switching providers doesn't require call-site changes

**Non-Goals:**
- Per-page or per-block effort adjustment (effort is per-task-type, not per-invocation)
- Dynamic effort scaling based on content complexity (future work)
- Support for multiple models simultaneously (one model per run)
- Exposing raw token budgets to end users (abstracted behind named levels)

## Decisions

### 1. Named effort levels over raw token budgets

**Decision**: Define a `ThinkingEffort` type as `"none" | "low" | "medium" | "high"` rather than exposing raw thinking token counts.

**Rationale**: Named levels are stable across model changes. If we switch from Gemini to another provider, the mapping changes but call sites don't. Raw budgets would leak model-specific details into every caller.

**Alternatives considered**:
- Raw token numbers: More precise but fragile across model changes and opaque to users.
- Boolean on/off: Too coarse — the gap between "no thinking" and "full thinking" is large.

### 2. Per-task defaults in a dedicated config map

**Decision**: Add a `TASK_THINKING_EFFORT` record in `src/config/clients.ts` mapping task identifiers to default effort levels:

```
page-number    → "low"
orientation    → "medium"
figures        → "medium"
reading-order  → "high"
translation    → "high"
```

**Rationale**: Co-locates all thinking effort config. Task identifiers reuse existing `schemaName` values where possible, keeping the mapping intuitive.

**Alternatives considered**:
- Distribute defaults into each task's own config file: Matches the pattern for `ORIENTATION_LLM_MIN_CONFIDENCE`, but scatters related config across 5+ files making tuning harder.
- No defaults (always require explicit): Breaks the current zero-config experience.
- Centralized effort-to-budget mapping (`ThinkingEffort → number`): Rejected in favour of passing the effort level string directly via `reasoning.effort`, which is simpler and provider-agnostic.

### 4. Extend CompletionOptions with optional thinkingEffort

**Decision**: Add `thinkingEffort?: ThinkingEffort` to `CompletionOptions`. When provided, `callOpenRouter` maps it to the provider-specific request body parameter. When omitted, no thinking parameters are sent (preserving current behavior as the default).

**Rationale**: Optional field means zero changes required for callers that don't care about thinking effort. The `callVisionLLM` wrapper gains a matching optional parameter and passes it through.

### 5. Pass effort level directly via reasoning.effort

**Decision**: `callOpenRouter` passes the effort level string directly in the request body as `reasoning.effort`:

```json
{ "reasoning": { "effort": "high" } }
```

When `thinkingEffort` is `"none"` or unset, the `reasoning` field is omitted entirely.

**Rationale**: Provider-agnostic — no Gemini-specific mapping needed. The effort level names (`low`, `medium`, `high`) are passed as-is. Switching models requires no code changes as long as the provider supports OpenRouter's `reasoning` field.

**Alternatives considered**:
- Gemini-specific `provider.google.thinkingConfig.thinkingBudget` with token-count mapping: More precise but couples the code to one provider and requires maintaining a budget lookup table.

### 6. CLI flag with global override semantics

**Decision**: Add `--thinking-effort <level>` CLI option (values: `none`, `low`, `medium`, `high`). When set, it overrides all per-task defaults with the given level. Passed through `PipelineConfig` to the pipeline.

**Rationale**: Users who want to minimize cost can set `--thinking-effort none`; users who want maximum quality can set `--thinking-effort high`. Per-task defaults remain the sweet spot for most runs.

**Alternatives considered**:
- Per-task CLI flags (`--orientation-effort low`): Too many flags for a niche need.
- Config file: Adds complexity; CLI flag covers the primary use case.

## Risks / Trade-offs

- **[Global CLI override is coarse]** → `--thinking-effort low` sets all tasks to low, even translation which benefits from high effort. Mitigated by this being opt-in; the per-task defaults are the recommended path.
- **[Thinking tokens add cost]** → Higher effort levels increase token usage and API cost. Mitigated by defaulting simple tasks to `low` and only using `high` for complex tasks.
- **[Provider support varies]** → Not all models behind OpenRouter may honour `reasoning.effort`. Mitigated by graceful degradation — the field is simply ignored by models that don't support it.
