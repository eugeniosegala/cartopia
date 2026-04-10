import { FIGURE_CROP_MARGIN } from "../../config/image.js";
import { resolveThinkingEffort } from "../../config/clients.js";
import type { FigureInfo } from "../../types/vision.js";
import { callVisionLLM } from "../../clients/vision-llm.js";
import { cropImageCenter, toVisionImageSource } from "../../utils/image.js";
import type { ImageData } from "../../types/image.js";
import type { ThinkingEffort } from "../../types/pipeline.js";
import {
  clampBoundingBox,
  hasDegenerateBoundingBox,
  mapBoundingBoxFromCenteredCrop,
} from "../../utils/bounding-box.js";

const FIGURES_PROMPT = `You are analyzing a photographed book page. Your ONLY task is to identify images, illustrations, photographs, and drawings on the page.

Rules:
- Identify every visual figure on the page: photographs, illustrations, drawings, paintings, diagrams, maps, engravings, sketches.
- Do NOT include: text blocks, decorative borders, page ornaments, or the page itself.
- For each figure provide:
  - "boundingBox": normalized coordinates (0-1) relative to the full photo dimensions. "top" and "left" mark the upper-left corner. The box must tightly but completely contain the entire figure with minimal extra whitespace. Do NOT cut off any part of the figure.
  - "caption": the caption text associated with this figure, usually printed directly below or beside it (often starting with "Abb.", "Fig.", "Tafel", "Bild"). Set to null if no caption is found.
  - "type": use "full_page" if the figure fills most of the page, "illustration" for significant standalone images, "inline" for small images embedded within text.
- If there are no figures on the page, return an empty array.`;

const FIGURES_SCHEMA = {
  type: "object",
  properties: {
    figures: {
      type: "array",
      items: {
        type: "object",
        properties: {
          boundingBox: {
            type: "object",
            properties: {
              top: { type: "number" },
              left: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
            },
            required: ["top", "left", "width", "height"],
          },
          caption: { type: ["string", "null"] },
          type: {
            type: "string",
            enum: ["full_page", "illustration", "inline"],
          },
        },
        required: ["boundingBox", "caption", "type"],
      },
    },
  },
  required: ["figures"],
};

// --- Bounding box helpers ---

const clampFigures = (figures: FigureInfo[]): FigureInfo[] =>
  figures.map((figure) => ({
    ...figure,
    boundingBox: clampBoundingBox(figure.boundingBox),
  }));

const hasInvalidBox = (figure: FigureInfo): boolean =>
  hasDegenerateBoundingBox(figure.boundingBox);

const mapFiguresToFullImage = (figures: FigureInfo[]): FigureInfo[] =>
  figures.map((figure) => ({
    ...figure,
    boundingBox: mapBoundingBoxFromCenteredCrop(
      figure.boundingBox,
      FIGURE_CROP_MARGIN,
    ),
  }));

// --- Public API ---

export const detectFigures = async (
  image: ImageData,
  apiKey: string,
  effortOverride?: ThinkingEffort,
): Promise<FigureInfo[]> => {
  const effort = resolveThinkingEffort("page_figures", effortOverride);
  const result = await callVisionLLM<{ figures: FigureInfo[] }>(
    toVisionImageSource(image),
    apiKey,
    FIGURES_PROMPT,
    "Identify all figures on this book page.",
    "page_figures",
    FIGURES_SCHEMA,
    effort,
  );

  const figures = clampFigures(result.figures);

  // If any figures have degenerate boxes, retry with a 10%-cropped image to reduce noise
  if (figures.length > 0 && figures.some(hasInvalidBox)) {
    const croppedImage = await cropImageCenter(image, FIGURE_CROP_MARGIN);
    const retryResult = await callVisionLLM<{ figures: FigureInfo[] }>(
      toVisionImageSource(croppedImage),
      apiKey,
      FIGURES_PROMPT,
      "Identify all figures on this book page.",
      "page_figures",
      FIGURES_SCHEMA,
      effort,
    );
    const retryFigures = clampFigures(retryResult.figures);

    if (retryFigures.length > 0 && !retryFigures.some(hasInvalidBox)) {
      return mapFiguresToFullImage(retryFigures);
    }
  }

  return figures;
};
