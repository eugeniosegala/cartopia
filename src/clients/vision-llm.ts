import { callOpenRouter } from "./openrouter.js";
import type { VisionImageSource } from "../types/image.js";
import type { ThinkingEffort } from "../types/pipeline.js";

export const callVisionLLM = async <T>(
  image: VisionImageSource,
  apiKey: string,
  systemPrompt: string,
  userText: string,
  schemaName: string,
  schema: Record<string, unknown>,
  thinkingEffort?: ThinkingEffort,
): Promise<T> => {
  const { data } = await callOpenRouter<T>({
    apiKey,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${image.mimeType};base64,${image.base64}`,
            },
          },
          { type: "text", text: userText },
        ],
      },
    ],
    schemaName,
    schema,
    thinkingEffort,
  });

  return data;
};
