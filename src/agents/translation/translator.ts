import type { ProcessedPage } from "../../types/content.js";
import type { ThinkingEffort } from "../../types/pipeline.js";
import { callOpenRouter } from "../../clients/openrouter.js";
import { resolveThinkingEffort } from "../../config/clients.js";
import { DEFAULT_CONCURRENCY, TRANSLATION_CONTEXT_BLOCKS } from "../../config/pipeline.js";
import { processWithConcurrency } from "../../utils/concurrency.js";
import { toErrorMessage } from "../../utils/error.js";
import * as log from "../../utils/logger.js";
import { clonePage } from "./clone.js";
import {
  buildAfterContextPerPage,
  buildBeforeContextPerPage,
  getTranslatableEntries,
  splitTranslationChunks,
} from "./context.js";
import { hasSuspiciousUntranslatedSpan } from "./detector.js";
import {
  buildSystemPrompt,
  buildUserMessage,
  TRANSLATION_SCHEMA,
  type TranslateBatchOptions,
} from "./prompts.js";
export { resolveLanguage } from "./language.js";

export interface TranslateOptions {
  apiKey: string;
  targetLanguage: string;
  concurrency?: number;
  thinkingEffort?: ThinkingEffort;
}

const callTranslationLLM = async (
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  thinkingEffort?: ThinkingEffort,
): Promise<{ translations: string[] }> => {
  const { data, finishReason } = await callOpenRouter<{
    translations: string[];
  }>({
    apiKey,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    schemaName: "page_translation",
    schema: TRANSLATION_SCHEMA,
    thinkingEffort: resolveThinkingEffort("page_translation", thinkingEffort),
  });

  if (finishReason === "length") {
    log.warn("Translation response was truncated (finish_reason=length)");
  }

  return data;
};

// --- Batch helper with error handling ---

const translateBlocksBatch = async (
  texts: string[],
  beforeContext: string[],
  afterContext: string[],
  options: TranslateOptions,
  batchOptions: TranslateBatchOptions = {},
): Promise<string[] | null> => {
  try {
    const systemPrompt = buildSystemPrompt(
      options.targetLanguage,
      texts.length,
      batchOptions,
    );
    const userMessage = buildUserMessage(texts, beforeContext, afterContext);

    const result = await callTranslationLLM(
      options.apiKey,
      systemPrompt,
      userMessage,
      options.thinkingEffort,
    );

    if (result.translations.length !== texts.length) {
      log.warn(
        `Expected ${texts.length} translations, got ${result.translations.length}`,
      );
      return null;
    }

    return result.translations;
  } catch (err) {
    log.warn(`Translation batch failed: ${toErrorMessage(err)}`);
    return null;
  }
};

const getBlockRetryBeforeContext = (
  texts: string[],
  beforeContext: string[],
  blockIndex: number,
): string[] => (blockIndex === 0 ? beforeContext : [texts[blockIndex - 1]]);

const getBlockRetryAfterContext = (
  texts: string[],
  afterContext: string[],
  blockIndex: number,
): string[] =>
  blockIndex === texts.length - 1 ? afterContext : [texts[blockIndex + 1]];

// --- Public API ---

export const translatePages = async (
  pages: ProcessedPage[],
  options: TranslateOptions,
): Promise<ProcessedPage[]> => {
  const clonedPages = pages.map(clonePage);

  // Precompute context for each page from the original (untranslated) pages.
  // If the immediate neighbour has no text (e.g., full-page figure),
  // look further out to find the nearest page with translatable text.
  const beforeContextPerPage = buildBeforeContextPerPage(pages);
  const afterContextPerPage = buildAfterContextPerPage(pages);

  const translatePage = async (
    page: ProcessedPage,
    i: number,
  ): Promise<void> => {
    const translatableEntries = getTranslatableEntries(page);

    if (translatableEntries.length === 0) return;

    const pageLabel = page.bookPageNumber ?? page.pageNumber;
    const pageBeforeCtx = beforeContextPerPage[i];
    const pageAfterCtx = afterContextPerPage[i];

    const chunks = splitTranslationChunks(translatableEntries);

    log.debug(
      `Starting translation for page ${pageLabel} (${translatableEntries.length} blocks, ${chunks.length} chunk(s))`,
    );

    for (let c = 0; c < chunks.length; c++) {
      const { texts, entries } = chunks[c];

      // Before context: previous page for first chunk, trailing source texts from previous chunk otherwise
      const beforeCtx =
        c === 0
          ? pageBeforeCtx
          : chunks[c - 1].texts.slice(-TRANSLATION_CONTEXT_BLOCKS);

      // After context: next page for last chunk, leading source texts from next chunk otherwise
      const afterCtx =
        c === chunks.length - 1
          ? pageAfterCtx
          : chunks[c + 1].texts.slice(0, TRANSLATION_CONTEXT_BLOCKS);

      const batchResult = await translateBlocksBatch(
        texts,
        beforeCtx,
        afterCtx,
        options,
      );

      if (batchResult) {
        for (let j = 0; j < entries.length; j++) {
          page.contentBlocks[entries[j].idx].text = batchResult[j];
        }

        // Retry blocks with suspicious untranslated spans
        for (let j = 0; j < entries.length; j++) {
          if (!hasSuspiciousUntranslatedSpan(texts[j], batchResult[j]))
            continue;

          log.warn(
            `Detected untranslated source text in block ${j + 1} (chunk ${c + 1}) on page ${pageLabel}; retrying block`,
          );
          const single = await translateBlocksBatch(
            [texts[j]],
            getBlockRetryBeforeContext(texts, beforeCtx, j),
            getBlockRetryAfterContext(texts, afterCtx, j),
            options,
            { strict: true },
          );

          if (single) {
            page.contentBlocks[entries[j].idx].text = single[0];
          }
        }
      } else {
        // Batch failed — fall back to translating one block at a time
        log.debug(
          `Falling back to per-block translation for page ${pageLabel} chunk ${c + 1}`,
        );
        for (let j = 0; j < entries.length; j++) {
          const single = await translateBlocksBatch(
            [texts[j]],
            getBlockRetryBeforeContext(texts, beforeCtx, j),
            getBlockRetryAfterContext(texts, afterCtx, j),
            options,
            { strict: true },
          );
          if (single) {
            page.contentBlocks[entries[j].idx].text = single[0];
          } else {
            page.errors.push(`Translation failed for block ${j + 1}`);
          }
        }
      }
    }
  };

  await processWithConcurrency(
    clonedPages,
    translatePage,
    options.concurrency ?? DEFAULT_CONCURRENCY,
    (completed, total) => log.progress(completed, total, "Translating"),
  );

  return clonedPages;
};
