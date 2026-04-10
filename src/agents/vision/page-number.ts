import { resolveThinkingEffort } from "../../config/clients.js";
import { callVisionLLM } from "../../clients/vision-llm.js";
import type { VisionImageSource } from "../../types/image.js";
import type { ThinkingEffort } from "../../types/pipeline.js";

const PAGE_NUMBER_PROMPT = `You are analyzing a photographed book page. Your ONLY task is to identify the official printed page number.

What IS a page number:
- A number that was TYPESET as part of the book's original printing.
- Printed in the SAME typeface and style as the book's body text — clean, uniform, machine-printed.
- Located at the very top or very bottom margin of the page, usually centered or in a corner.
- A simple number: plain digits (e.g., "7", "42", "156") or Roman numerals (e.g., "iv", "xi").
- Typically small (8-10pt font), separate from the main content.

What is NOT a page number — you MUST return null for these:
- HANDWRITTEN text of any kind: pencil, pen, or ink markings added by hand. These are often library catalog numbers, personal notes, or dates scribbled by previous owners. They look irregular, uneven, or sketchy compared to printed text.
- Title pages: these almost NEVER have a page number. If the page shows a book title, author name, and publisher, return null.
- Chapter numbers, section numbers (e.g., "2.3"), figure numbers (e.g., "Abb. 5").
- Stamps, stickers, or barcodes.

When in doubt, return null. It is far better to miss a page number than to report a wrong one.`;

const PAGE_NUMBER_SCHEMA = {
  type: "object",
  properties: {
    pageNumber: { type: ["string", "null"] },
  },
  required: ["pageNumber"],
};

export const detectPageNumber = async (
  image: VisionImageSource,
  apiKey: string,
  effortOverride?: ThinkingEffort,
): Promise<string | null> => {
  const result = await callVisionLLM<{ pageNumber: string | null }>(
    image,
    apiKey,
    PAGE_NUMBER_PROMPT,
    "What is the printed page number on this book page?",
    "page_number",
    PAGE_NUMBER_SCHEMA,
    resolveThinkingEffort("page_number", effortOverride),
  );
  return result.pageNumber;
};
