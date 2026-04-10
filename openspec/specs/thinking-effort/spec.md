## ADDED Requirements

### Requirement: Thinking effort levels
The system SHALL support four named thinking effort levels: `none`, `low`, `medium`, and `high`. Each level SHALL be passed directly as a `reasoning.effort` string in the API request body. The `none` level SHALL disable reasoning entirely (no `reasoning` field sent).

#### Scenario: Effort level included in request
- **WHEN** an LLM call is made with `thinkingEffort` set to `"medium"`
- **THEN** the API request body SHALL include `reasoning.effort` set to `"medium"`

#### Scenario: No thinking effort specified
- **WHEN** an LLM call is made without a `thinkingEffort` value
- **THEN** the API request body SHALL NOT include a `reasoning` field, preserving current default behavior

#### Scenario: None level disables reasoning
- **WHEN** an LLM call is made with `thinkingEffort` set to `"none"`
- **THEN** the API request body SHALL NOT include a `reasoning` field

### Requirement: Per-task default effort levels
The system SHALL define a default thinking effort level for each LLM-powered pipeline task. The defaults SHALL be:
- `page-number` detection: `low`
- `orientation` detection: `medium`
- `figures` detection: `medium`
- `reading-order` reordering: `high`
- `translation`: `high`

#### Scenario: Task uses its configured default
- **WHEN** the `figures` detection task makes an LLM call and no global override is set
- **THEN** the call SHALL use the `medium` thinking effort level

#### Scenario: Translation uses high effort by default
- **WHEN** the translation task makes an LLM call and no global override is set
- **THEN** the call SHALL use the `high` thinking effort level

### Requirement: CLI thinking effort override
The system SHALL accept a `--thinking-effort <level>` CLI option with values `none`, `low`, `medium`, or `high`. When provided, this option SHALL override all per-task default effort levels for the entire pipeline run.

#### Scenario: Global override applies to all tasks
- **WHEN** the user runs the CLI with `--thinking-effort low`
- **THEN** every LLM call in the pipeline SHALL use the `low` thinking effort level, regardless of per-task defaults

#### Scenario: Invalid effort level rejected
- **WHEN** the user runs the CLI with `--thinking-effort extreme`
- **THEN** the CLI SHALL exit with an error indicating the valid options

#### Scenario: No override preserves per-task defaults
- **WHEN** the user runs the CLI without `--thinking-effort`
- **THEN** each task SHALL use its own configured default effort level

### Requirement: Effort parameter plumbing through client interfaces
The `CompletionOptions` interface SHALL accept an optional `thinkingEffort` field. The `callVisionLLM` function SHALL accept an optional `thinkingEffort` parameter and pass it through to `callOpenRouter`.

#### Scenario: CompletionOptions accepts thinkingEffort
- **WHEN** a caller passes `{ thinkingEffort: "high" }` in `CompletionOptions`
- **THEN** `callOpenRouter` SHALL include `reasoning.effort` set to `"high"` in the API request

#### Scenario: callVisionLLM passes effort through
- **WHEN** `callVisionLLM` is called with `thinkingEffort: "medium"`
- **THEN** the underlying `callOpenRouter` call SHALL receive `thinkingEffort: "medium"` in its options
