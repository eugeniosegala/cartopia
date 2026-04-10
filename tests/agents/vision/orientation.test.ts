import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { normalizePageOrientation } from "../../../src/agents/vision/orientation.js";
import type { ImageData } from "../../../src/utils/image.js";
import {
  okJsonSchemaResponse,
  setupMockFetch,
} from "../../support/openrouter-mocks.js";

const mockFetch = setupMockFetch();

const createImageData = async (
  width: number,
  height: number,
): Promise<ImageData> => {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .jpeg()
    .toBuffer();

  return { buffer, width, height, mimeType: "image/jpeg" };
};

describe("normalizePageOrientation", () => {
  it("keeps an upright portrait image unchanged when the LLM returns 0 degrees", async () => {
    const image = await createImageData(200, 300);
    mockFetch.mockResolvedValueOnce(
      okJsonSchemaResponse({ rotationDegrees: "0", confidence: 0.97 }),
    );

    const result = await normalizePageOrientation(
      image,
      "page-001.jpg",
      "test-key",
    );

    expect(result).toBe(image);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("rotates an upside-down portrait image when the LLM confidently returns 180 degrees", async () => {
    const image = await createImageData(200, 300);
    mockFetch.mockResolvedValueOnce(
      okJsonSchemaResponse({ rotationDegrees: "180", confidence: 0.98 }),
    );

    const result = await normalizePageOrientation(
      image,
      "page-001b.jpg",
      "test-key",
    );

    expect(result).not.toBe(image);
    expect(result.width).toBe(200);
    expect(result.height).toBe(300);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("rotates a landscape image when the LLM gives a confident answer", async () => {
    const image = await createImageData(300, 200);
    mockFetch.mockResolvedValueOnce(
      okJsonSchemaResponse({ rotationDegrees: "90", confidence: 0.96 }),
    );

    const result = await normalizePageOrientation(
      image,
      "page-002.jpg",
      "test-key",
    );

    expect(result.width).toBe(200);
    expect(result.height).toBe(300);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [, opts] = mockFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.response_format.json_schema.name).toBe("page_orientation");
  });

  it("keeps a portrait image unchanged when the LLM is not confident enough", async () => {
    const image = await createImageData(200, 300);
    mockFetch.mockResolvedValueOnce(
      okJsonSchemaResponse({ rotationDegrees: "180", confidence: 0.62 }),
    );

    const result = await normalizePageOrientation(
      image,
      "page-003a.jpg",
      "test-key",
    );

    expect(result).toBe(image);
  });

  it("throws for a landscape image when the LLM is not confident enough", async () => {
    const image = await createImageData(300, 200);
    mockFetch.mockResolvedValueOnce(
      okJsonSchemaResponse({ rotationDegrees: "90", confidence: 0.62 }),
    );

    await expect(
      normalizePageOrientation(image, "page-003b.jpg", "test-key"),
    ).rejects.toThrow("Vision orientation confidence too low");
  });

  it("throws when the suggested rotation does not recover portrait orientation", async () => {
    const image = await createImageData(300, 200);
    mockFetch.mockResolvedValueOnce(
      okJsonSchemaResponse({ rotationDegrees: "180", confidence: 0.95 }),
    );

    await expect(
      normalizePageOrientation(image, "page-004.jpg", "test-key"),
    ).rejects.toThrow("did not recover a portrait image");
  });

  it("passes thinking effort override to the LLM call", async () => {
    const image = await createImageData(200, 300);
    mockFetch.mockResolvedValueOnce(
      okJsonSchemaResponse({ rotationDegrees: "0", confidence: 0.97 }),
    );

    await normalizePageOrientation(image, "page-005.jpg", "test-key", "high");

    const [, opts] = mockFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.reasoning).toEqual({ effort: "high" });
  });

  it("uses task default thinking effort when no override is given", async () => {
    const image = await createImageData(200, 300);
    mockFetch.mockResolvedValueOnce(
      okJsonSchemaResponse({ rotationDegrees: "0", confidence: 0.97 }),
    );

    await normalizePageOrientation(image, "page-006.jpg", "test-key");

    const [, opts] = mockFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    // page_orientation default is "medium"
    expect(body.reasoning).toEqual({ effort: "medium" });
  });
});
