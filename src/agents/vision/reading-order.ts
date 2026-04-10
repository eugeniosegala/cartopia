import { READING_ORDER_MAX_PREVIEW_LENGTH } from "../../config/reading-order.js";
import { resolveThinkingEffort } from "../../config/clients.js";
import { callVisionLLM } from "../../clients/vision-llm.js";
import type { ContentBlock } from "../../types/content.js";
import type { VisionImageSource } from "../../types/image.js";
import type { ThinkingEffort } from "../../types/pipeline.js";
import { postprocessReorderedBlocks } from "../processors/reading-order-postprocess.js";

const READING_ORDER_PROMPT = `You are analyzing a photographed book page. Your ONLY task is to determine the correct reading order of the content blocks listed below.

You will receive:
1. An image of the book page.
2. A numbered list of content blocks with their type, position (top/left as 0-1 normalized coordinates), and a text preview.

Rules for determining reading order:
- Read top-to-bottom as the primary direction.
- If the page has multiple columns, read the LEFT column entirely before the RIGHT column.
- Titles and section headers come before the body text they introduce.
- Figures and figure captions should stay adjacent and appear near the text that references them.
- Page-level elements (headers, footers, page numbers) keep their natural position (top or bottom).

Return every block index exactly once, in the correct reading order. Do not skip or duplicate any index.`;

const READING_ORDER_SCHEMA = {
  type: "object",
  properties: {
    order: {
      type: "array",
      items: { type: "integer" },
    },
  },
  required: ["order"],
};

const summarizeBlocks = (blocks: ContentBlock[]): string =>
  blocks
    .map((b, i) => {
      const preview = b.text
        .slice(0, READING_ORDER_MAX_PREVIEW_LENGTH)
        .replaceAll("\n", " ");
      const { top, left } = b.boundingBox;
      return `[${i}] ${b.type} (top=${top.toFixed(2)} left=${left.toFixed(2)}) "${preview}"`;
    })
    .join("\n");

const isValidOrder = (order: number[], length: number): boolean => {
  if (order.length !== length) return false;
  const seen = new Set<number>();
  for (const idx of order) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= length || seen.has(idx))
      return false;
    seen.add(idx);
  }
  return true;
};

export const reorderBlocks = async (
  image: VisionImageSource | string,
  contentBlocks: ContentBlock[],
  apiKey: string,
  effortOverride?: ThinkingEffort,
): Promise<ContentBlock[]> => {
  if (contentBlocks.length <= 1) return contentBlocks;
  const imageSource =
    typeof image === "string"
      ? { base64: image, mimeType: "image/jpeg" as const }
      : image;

  const blockSummary = summarizeBlocks(contentBlocks);
  const userText = `Here are the content blocks to reorder:\n\n${blockSummary}\n\nReturn the indices in correct reading order.`;

  const result = await callVisionLLM<{ order: number[] }>(
    imageSource,
    apiKey,
    READING_ORDER_PROMPT,
    userText,
    "reading_order",
    READING_ORDER_SCHEMA,
    resolveThinkingEffort("reading_order", effortOverride),
  );

  const reordered = isValidOrder(result.order, contentBlocks.length)
    ? result.order.map((i) => contentBlocks[i])
    : contentBlocks;

  return postprocessReorderedBlocks(reordered);
};
