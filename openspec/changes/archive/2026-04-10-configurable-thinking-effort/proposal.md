## Why

Every LLM call in the pipeline uses identical model parameters (temperature 0, no token budget, no reasoning effort), yet tasks vary wildly in cognitive demand — detecting a printed page number is trivial compared to translating a dense paragraph with cross-page context. Without per-task thinking effort configuration, we either overspend on simple tasks (latency + cost) or underspend on hard ones (quality). Configurable thinking effort lets us right-size each call.

## What Changes

- Extend `CompletionOptions` with an optional `thinkingEffort` parameter that controls how much reasoning budget the model gets for a given call.
- Define a set of effort levels (e.g., `low`, `medium`, `high`) that map to concrete model parameters — initially targeting OpenRouter's pass-through for Gemini's `thinkingConfig.thinkingBudget` and applicable to other providers' reasoning effort controls.
- Add per-task default effort configuration in `src/config/` so each pipeline stage has a sensible default (e.g., `page-number` → `low`, `translation` → `high`).
- Expose a CLI option to override the global default effort level, allowing users to trade off speed/cost vs. quality.
- Wire the effort parameter through `callOpenRouter` and `callVisionLLM` to the API request body.

## Capabilities

### New Capabilities
- `thinking-effort`: Defines effort levels, their mapping to model parameters, per-task defaults, and CLI override behavior.

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **Code**: `src/clients/openrouter.ts`, `src/clients/vision-llm.ts` (parameter plumbing), `src/config/clients.ts` (effort level definitions and per-task defaults), `src/cli.ts` (new CLI flag), `src/types/` (updated interfaces).
- **All 5 LLM call sites**: `orientation.ts`, `figures.ts`, `page-number.ts`, `reading-order.ts`, `translator.ts` — each will pass its configured effort level.
- **API cost/latency**: Thinking tokens are billed; lower effort on simple tasks reduces cost, higher effort on complex tasks improves quality.
- **No breaking changes**: The effort parameter is optional with backwards-compatible defaults matching current behavior.
