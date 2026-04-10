import { describe, expect, it } from "vitest";
import { postprocessReorderedBlocks } from "../../../src/agents/processors/reading-order-postprocess.js";
import { BlockType } from "../../../src/types.js";
import { makeBlock } from "../../support/content-factories.js";

describe("postprocessReorderedBlocks", () => {
  it("snaps a caption to its nearest figure", () => {
    const blocks = [
      makeBlock(BlockType.TEXT, "Intro text", 0.05, 0.05),
      makeBlock(BlockType.FIGURE, "", 0.2, 0.5),
      makeBlock(BlockType.TEXT, "Middle text", 0.4, 0.05),
      makeBlock(BlockType.FIGURE_CAPTION, "Abb. 1", 0.38, 0.5),
    ];

    const result = postprocessReorderedBlocks(blocks);
    const figureIndex = result.findIndex((block) => block.type === BlockType.FIGURE);

    expect(result[figureIndex + 1].type).toBe(BlockType.FIGURE_CAPTION);
    expect(result[figureIndex + 1].text).toBe("Abb. 1");
  });

  it("snaps a caption to the closest figure when multiple figures exist", () => {
    const blocks = [
      makeBlock(BlockType.FIGURE, "", 0.1, 0.05),
      makeBlock(BlockType.FIGURE, "", 0.6, 0.05),
      makeBlock(BlockType.FIGURE_CAPTION, "Caption for fig 2", 0.65, 0.05),
    ];

    const result = postprocessReorderedBlocks(blocks);

    expect(result[2].type).toBe(BlockType.FIGURE_CAPTION);
    expect(result[2].text).toBe("Caption for fig 2");
  });

  it("removes a text block that duplicates the preceding figure caption", () => {
    const blocks = [
      makeBlock(BlockType.FIGURE, "", 0.1, 0.25),
      makeBlock(
        BlockType.FIGURE_CAPTION,
        "Abb. 2. Elternhaus Gregor Erharts in Ulm (Lange Straße 34, A301)",
        0.1,
        0.25,
      ),
      makeBlock(
        BlockType.TEXT,
        "Abb. 2. Elternhaus Gregor Erharts\nin Ulm (Lange Straße 34, A301)",
        0.69,
        0.07,
      ),
      makeBlock(BlockType.TEXT, "Some other paragraph", 0.8, 0.05),
    ];

    const result = postprocessReorderedBlocks(blocks);

    expect(result).toHaveLength(3);
    expect(
      result.find(
        (block) =>
          block.type === BlockType.TEXT && block.text.startsWith("Abb. 2"),
      ),
    ).toBeUndefined();
    expect(result[2].text).toBe("Some other paragraph");
  });

  it("keeps a text block after a caption when the content differs", () => {
    const blocks = [
      makeBlock(BlockType.FIGURE, "", 0.1, 0.25),
      makeBlock(BlockType.FIGURE_CAPTION, "Abb. 1. A painting", 0.1, 0.25),
      makeBlock(
        BlockType.TEXT,
        "Completely unrelated paragraph text",
        0.5,
        0.05,
      ),
    ];

    const result = postprocessReorderedBlocks(blocks);

    expect(result).toHaveLength(3);
    expect(result[2].text).toBe("Completely unrelated paragraph text");
  });

  it("removes a partial text duplicate when the overlap is high", () => {
    const blocks = [
      makeBlock(BlockType.FIGURE, "", 0.05, 0.08),
      makeBlock(
        BlockType.FIGURE_CAPTION,
        "Abb. 2. Elternhaus Gregor Erharts in Ulm",
        0.05,
        0.08,
      ),
      makeBlock(BlockType.TEXT, "Elternhaus Gregor Erharts in Ulm", 0.86, 0.3),
    ];

    const result = postprocessReorderedBlocks(blocks);

    expect(result).toHaveLength(2);
    expect(result.every((block) => block.type !== BlockType.TEXT)).toBe(true);
  });

  it("removes a short text fragment that is a caption substring", () => {
    const blocks = [
      makeBlock(BlockType.FIGURE, "", 0.05, 0.08),
      makeBlock(
        BlockType.FIGURE_CAPTION,
        "Abb. 1. Jörg Syrlin d. Ä.: Riss zum Ulmer Münsterhochaltar. Stuttgart, Landesmuseum Württemberg",
        0.05,
        0.08,
      ),
      makeBlock(
        BlockType.TEXT,
        "rhochaltar. Stuttgart, Landesmuseum",
        0.86,
        0.3,
      ),
    ];

    const result = postprocessReorderedBlocks(blocks);

    expect(result).toHaveLength(2);
    expect(result.every((block) => block.type !== BlockType.TEXT)).toBe(true);
  });

  it("removes a nearby duplicate caption even when OCR junk appears first", () => {
    const blocks = [
      makeBlock(BlockType.FIGURE, "", 0.05, 0.08),
      makeBlock(
        BlockType.FIGURE_CAPTION,
        "Abb. 3. Allianzwappen Fugger vom Reh und Erhart aus dem Geheimen Ehrenbuch der Fugger. Munchen, Bayerische Staatsbibliothek",
        0.05,
        0.08,
      ),
      makeBlock(
        BlockType.TEXT,
        "Sherminus gera Celichez Done Burger vird cot Rixfinez hat etteche Fundez Edid) in celeche Therminms fuggers Seltche",
        0.62,
        0.08,
      ),
      makeBlock(
        BlockType.TEXT,
        "Abb. 3. Allianzwappen Fugger vom Reh und Erhart aus dem Geheimen Ehrenbuch der Fugger. Munchen, Bayerische Staatsbibliothek",
        0.74,
        0.08,
      ),
      makeBlock(
        BlockType.TEXT,
        "deren Professionen sowie auch bei ihren Ehepartnern ablesbar.",
        0.84,
        0.08,
      ),
    ];

    const result = postprocessReorderedBlocks(blocks);

    expect(result).toHaveLength(4);
    expect(result[2].text).toContain("Sherminus gera");
    expect(
      result.find(
        (block) =>
          block.type === BlockType.TEXT &&
          block.text.startsWith("Abb. 3. Allianzwappen"),
      ),
    ).toBeUndefined();
  });

  it("removes a trailing caption fragment repeated as a nearby text block", () => {
    const blocks = [
      makeBlock(BlockType.FIGURE, "", 0.05, 0.55),
      makeBlock(
        BlockType.FIGURE_CAPTION,
        "Abb. 2. Hans Beierlein: Kreuzaltar. Murau, St. Matthäus",
        0.05,
        0.55,
      ),
      makeBlock(BlockType.TEXT, "Murau, St. Matthäus", 0.74, 0.05),
      makeBlock(BlockType.TEXT, "Weiterer Fließtext beginnt hier.", 0.84, 0.05),
    ];

    const result = postprocessReorderedBlocks(blocks);

    expect(result).toHaveLength(3);
    expect(
      result.find(
        (block) => block.type === BlockType.TEXT && block.text === "Murau, St. Matthäus",
      ),
    ).toBeUndefined();
    expect(result[2].text).toBe("Weiterer Fließtext beginnt hier.");
  });

  it("merges adjacent text blocks when a paragraph wraps into the next column", () => {
    const blocks = [
      makeBlock(
        BlockType.TEXT,
        "This is followed by analyses of the formative factors determining Gregor Erhart's artistic identity, as well as in",
        0.67,
        0.06,
        0.37,
        0.09,
      ),
      makeBlock(
        BlockType.TEXT,
        "Augsburg at the beginning of the 16th century. The discussion initially deals with questions regarding the division of labour.",
        0.05,
        0.49,
        0.39,
        0.14,
      ),
    ];

    const result = postprocessReorderedBlocks(blocks);

    expect(result).toHaveLength(1);
    expect(result[0].text).toContain(
      "as well as in Augsburg at the beginning of the 16th century.",
    );
  });

  it("does not merge cross-column text blocks when the first block ends a sentence", () => {
    const blocks = [
      makeBlock(
        BlockType.TEXT,
        "This chapter closes the argument.",
        0.67,
        0.06,
        0.37,
        0.09,
      ),
      makeBlock(
        BlockType.TEXT,
        "Augsburg at the beginning of the 16th century introduces the next chapter.",
        0.05,
        0.49,
        0.39,
        0.14,
      ),
    ];

    const result = postprocessReorderedBlocks(blocks);

    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("This chapter closes the argument.");
    expect(result[1].text).toBe(
      "Augsburg at the beginning of the 16th century introduces the next chapter.",
    );
  });
});
