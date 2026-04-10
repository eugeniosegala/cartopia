## 1. Types and Config

- [x] 1.1 Add `ThinkingEffort` type (`"none" | "low" | "medium" | "high"`) to `src/types/pipeline.ts`
- [x] 1.2 Add `THINKING_EFFORT_BUDGETS` mapping (`ThinkingEffort → number`) and `TASK_THINKING_EFFORT` per-task defaults to `src/config/clients.ts`
- [x] 1.3 Add optional `thinkingEffort` field to `PipelineConfig` in `src/types/pipeline.ts`

## 2. Client Plumbing

- [x] 2.1 Add optional `thinkingEffort` field to `CompletionOptions` in `src/clients/openrouter.ts`
- [x] 2.2 Implement provider-specific budget mapping in `callOpenRouter` — translate effort level to `provider.google.thinkingConfig.thinkingBudget` in the request body
- [x] 2.3 Add optional `thinkingEffort` parameter to `callVisionLLM` and pass it through to `callOpenRouter`

## 3. Call Site Updates

- [x] 3.1 Update `orientation.ts` to pass thinking effort (from pipeline config override or `low` default)
- [x] 3.2 Update `figures.ts` to pass thinking effort (from pipeline config override or `medium` default)
- [x] 3.3 Update `page-number.ts` to pass thinking effort (from pipeline config override or `low` default)
- [x] 3.4 Update `reading-order.ts` to pass thinking effort (from pipeline config override or `medium` default)
- [x] 3.5 Update `translator.ts` to pass thinking effort (from pipeline config override or `high` default)

## 4. CLI and Pipeline

- [x] 4.1 Add `--thinking-effort <level>` option to CLI in `src/cli.ts` with validation for allowed values
- [x] 4.2 Thread `thinkingEffort` through `processBook()` in `src/pipeline.ts` to all LLM call sites

## 5. Tests

- [x] 5.1 Add unit tests for effort-to-budget mapping (all four levels + undefined)
- [x] 5.2 Add tests verifying `callOpenRouter` includes correct `provider` block when effort is set and omits it when not set
- [x] 5.3 Update existing vision and translation tests to verify thinking effort is passed through
- [x] 5.4 Add CLI test for `--thinking-effort` option parsing and validation
