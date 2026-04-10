import type { VisionAnalysis } from "../../types/vision.js";
import type { ImageData } from "../../types/image.js";
import type { ThinkingEffort } from "../../types/pipeline.js";
import { toVisionImageSource } from "../../utils/image.js";
import { detectPageNumber } from "./page-number.js";
import { detectFigures } from "./figures.js";

export const analyzePageVision = async (
  image: ImageData,
  apiKey: string,
  effortOverride?: ThinkingEffort,
): Promise<VisionAnalysis> => {
  const imageSource = toVisionImageSource(image);

  const [pageNumber, figures] = await Promise.all([
    detectPageNumber(imageSource, apiKey, effortOverride).catch(() => null),
    detectFigures(image, apiKey, effortOverride).catch(() => []),
  ]);

  return { pageNumber, figures };
};
