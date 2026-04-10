import { describe, expect, it } from "vitest";
import { translatePages } from "../../../src/agents/translation/translator.js";
import { OPENROUTER_MODEL, OPENROUTER_URL } from "../../../src/config.js";
import { BlockType, type ProcessedPage } from "../../../src/types.js";
import { makePage } from "../../support/content-factories.js";
import {
  okJsonSchemaResponse,
  setupMockFetch,
} from "../../support/openrouter-mocks.js";

const mockFetch = setupMockFetch();

const opts = { apiKey: "test-key", targetLanguage: "English" };

describe("translatePages", () => {
  it("translates text blocks across multiple pages", async () => {
    mockFetch
      .mockResolvedValueOnce(okJsonSchemaResponse({ translations: ["Title EN"] }))
      .mockResolvedValueOnce(okJsonSchemaResponse({ translations: ["Para EN"] }));

    const pages = [
      makePage(1, [{ type: BlockType.TITLE, text: "Titel DE" }]),
      makePage(2, [{ type: BlockType.TEXT, text: "Absatz DE" }]),
    ];

    const result = await translatePages(pages, opts);

    expect(result).toHaveLength(2);
    expect(result[0].contentBlocks[0].text).toBe("Title EN");
    expect(result[1].contentBlocks[0].text).toBe("Para EN");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("includes context from previous page in second call", async () => {
    mockFetch
      .mockResolvedValueOnce(okJsonSchemaResponse({ translations: ["Title EN"] }))
      .mockResolvedValueOnce(okJsonSchemaResponse({ translations: ["Para EN"] }));

    const pages = [
      makePage(1, [{ type: BlockType.TEXT, text: "Kontext Absatz" }]),
      makePage(2, [{ type: BlockType.TEXT, text: "Nächster Absatz" }]),
    ];

    await translatePages(pages, opts);

    const [, request] = mockFetch.mock.calls[1];
    const body = JSON.parse(request.body);
    const userMessage = body.messages[1].content as string;
    expect(userMessage).toContain("[BEFORE");
    expect(userMessage).toContain("Kontext Absatz");
  });

  it("skips non-translatable blocks and preserves figure data", async () => {
    const imageBuffer = Buffer.from("fake-image");
    mockFetch.mockResolvedValueOnce(
      okJsonSchemaResponse({ translations: ["Caption EN"] }),
    );

    const pages: ProcessedPage[] = [
      {
        pageNumber: 1,
        filePath: "p1.jpg",
        contentBlocks: [
          {
            type: BlockType.FIGURE,
            text: "",
            confidence: 99,
            boundingBox: { top: 0, left: 0, width: 1, height: 1 },
            imageBuffer,
            imageDimensions: { width: 800, height: 600 },
          },
          {
            type: BlockType.FIGURE_CAPTION,
            text: "Abb. 1: Beschreibung",
            confidence: 99,
            boundingBox: { top: 0.9, left: 0, width: 1, height: 0.1 },
          },
        ],
        errors: [],
      },
    ];

    const result = await translatePages(pages, opts);

    expect(result[0].contentBlocks[0].imageBuffer).toBe(imageBuffer);
    expect(result[0].contentBlocks[0].text).toBe("");
    expect(result[0].contentBlocks[1].text).toBe("Caption EN");

    const [, request] = mockFetch.mock.calls[0];
    const body = JSON.parse(request.body);
    const userMessage = body.messages[1].content as string;
    expect(userMessage).not.toContain("FIGURE");
    expect(userMessage).toContain("Abb. 1: Beschreibung");
  });

  it("handles LLM failure gracefully and keeps original text", async () => {
    const errorResponse = {
      ok: false,
      status: 500,
      text: async () => "server error",
    };

    mockFetch
      .mockResolvedValueOnce(okJsonSchemaResponse({ translations: ["Title EN"] }))
      .mockResolvedValue(errorResponse);

    const pages = [
      makePage(1, [{ type: BlockType.TITLE, text: "Titel" }]),
      makePage(2, [{ type: BlockType.TEXT, text: "Original bleibt" }]),
    ];

    const result = await translatePages(pages, opts);

    expect(result[0].contentBlocks[0].text).toBe("Title EN");
    expect(result[1].contentBlocks[0].text).toBe("Original bleibt");
    expect(result[1].errors).toContain("Translation failed for block 1");
  });

  it("falls back to per-block translation when a batch returns the wrong count", async () => {
    mockFetch
      .mockResolvedValueOnce(okJsonSchemaResponse({ translations: ["Only one"] }))
      .mockResolvedValueOnce(
        okJsonSchemaResponse({ translations: ["Block one EN"] }),
      )
      .mockResolvedValueOnce(
        okJsonSchemaResponse({ translations: ["Block two EN"] }),
      );

    const pages = [
      makePage(1, [
        { type: BlockType.TEXT, text: "Block eins" },
        { type: BlockType.TEXT, text: "Block zwei" },
      ]),
    ];

    const result = await translatePages(pages, opts);

    expect(result[0].contentBlocks[0].text).toBe("Block one EN");
    expect(result[0].contentBlocks[1].text).toBe("Block two EN");
    expect(result[0].errors).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("retries a block when untranslated source text remains in the translation", async () => {
    const sourceText =
      "Die Stadt war damals sehr reich und überaus mächtig in der ganzen Region bekannt.";
    const badTranslation =
      "The city was damals sehr reich und überaus mächtig in the whole region.";
    const goodTranslation =
      "The city was at that time very rich and exceedingly powerful, known throughout the entire region.";

    mockFetch
      .mockResolvedValueOnce(
        okJsonSchemaResponse({ translations: [badTranslation] }),
      )
      .mockResolvedValueOnce(
        okJsonSchemaResponse({ translations: [goodTranslation] }),
      );

    const result = await translatePages(
      [makePage(1, [{ type: BlockType.TEXT, text: sourceText }])],
      opts,
    );

    expect(result[0].contentBlocks[0].text).toBe(goodTranslation);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const [, retryRequest] = mockFetch.mock.calls[1];
    const retryBody = JSON.parse(retryRequest.body);
    expect(retryBody.messages[0].content).toContain(
      "A previous attempt left source-language wording behind",
    );
  });

  it("does not mutate the original pages array", async () => {
    mockFetch.mockResolvedValueOnce(
      okJsonSchemaResponse({ translations: ["Translated"] }),
    );

    const pages = [makePage(1, [{ type: BlockType.TEXT, text: "Original" }])];
    const result = await translatePages(pages, opts);

    result[0].contentBlocks[0].text = "Modified";
    expect(pages[0].contentBlocks[0].text).toBe("Original");
  });

  it("sends the expected model and structured output format", async () => {
    mockFetch.mockResolvedValueOnce(
      okJsonSchemaResponse({ translations: ["EN"] }),
    );

    await translatePages(
      [makePage(1, [{ type: BlockType.TEXT, text: "DE" }])],
      opts,
    );

    const [url, request] = mockFetch.mock.calls[0];
    const body = JSON.parse(request.body);

    expect(url).toBe(OPENROUTER_URL);
    expect(body.model).toBe(OPENROUTER_MODEL);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.name).toBe("page_translation");
    expect(body.temperature).toBe(0);
    expect(request.headers.Authorization).toBe("Bearer test-key");
  });

  it("uses task default thinking effort (high) when no override is given", async () => {
    mockFetch.mockResolvedValueOnce(
      okJsonSchemaResponse({ translations: ["EN"] }),
    );

    await translatePages(
      [makePage(1, [{ type: BlockType.TEXT, text: "DE" }])],
      opts,
    );

    const [, request] = mockFetch.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(body.reasoning).toEqual({ effort: "high" });
  });

  it("passes thinking effort override to translation calls", async () => {
    mockFetch.mockResolvedValueOnce(
      okJsonSchemaResponse({ translations: ["EN"] }),
    );

    await translatePages(
      [makePage(1, [{ type: BlockType.TEXT, text: "DE" }])],
      { ...opts, thinkingEffort: "low" },
    );

    const [, request] = mockFetch.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(body.reasoning).toEqual({ effort: "low" });
  });
});
