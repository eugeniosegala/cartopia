import {
  CAPTION_DUPLICATE_LOOKAHEAD_TEXT_BLOCKS,
  COLUMN_WRAP_MAX_OVERLAP_RATIO,
  COLUMN_WRAP_MIN_HEIGHT_FALLBACK,
  COLUMN_WRAP_MIN_LEFT_SHIFT,
  COLUMN_WRAP_MIN_WIDTH_SIMILARITY,
  COLUMN_WRAP_PREVIOUS_BOTTOM_THRESHOLD,
  COLUMN_WRAP_TOP_RESET_THRESHOLD,
  CONTINUATION_END_WORDS,
  SAME_COLUMN_MAX_LEFT_DELTA,
  SAME_COLUMN_MAX_VERTICAL_GAP_FACTOR,
  SAME_COLUMN_MIN_OVERLAP_RATIO,
  TEXT_CONTINUATION_MIN_SCORE,
} from "../../config/reading-order.js";
import { BlockType, type ContentBlock } from "../../types/content.js";
import {
  boxBottom,
  boxDistance,
  horizontalOverlapRatio,
  mergeBoundingBoxes,
} from "../../utils/bounding-box.js";

const SENTENCE_END_REGEX = /[.!?…]["'»”)\]]*$/u;
const CONTINUATION_PUNCTUATION_REGEX = /[-,;:(]$/u;
const STARTS_WITH_LOWERCASE_REGEX = /^\p{Ll}/u;
const STARTS_WITH_FRAGMENT_REGEX = /^[-,.;:!?%)\]»]/u;
const LETTER_START_REGEX = /^\p{L}/u;
const LAST_WORD_REGEX = /(\p{L}[\p{L}\p{M}'’-]*)\s*$/u;

const snapCaptionsToFigures = (blocks: ContentBlock[]): ContentBlock[] => {
  const result = blocks.filter((block) => block.type !== BlockType.FIGURE_CAPTION);
  const captions = blocks.filter(
    (block) => block.type === BlockType.FIGURE_CAPTION,
  );

  for (const caption of captions) {
    const figures = result
      .map((block, index) => ({ index, block }))
      .filter(({ block }) => block.type === BlockType.FIGURE);

    if (figures.length === 0) {
      result.push(caption);
      continue;
    }

    const nearest = figures.reduce((best, current) =>
      boxDistance(current.block.boundingBox, caption.boundingBox) <
      boxDistance(best.block.boundingBox, caption.boundingBox)
        ? current
        : best,
    );

    result.splice(nearest.index + 1, 0, caption);
  }

  return result;
};

const normalizeTextForComparison = (text: string) =>
  text.replace(/\s+/g, " ").trim().toLowerCase();

const isDuplicateOfCaption = (
  captionText: string,
  textContent: string,
): boolean => {
  const caption = normalizeTextForComparison(captionText);
  const text = normalizeTextForComparison(textContent);
  if (text.length === 0) return false;

  if (caption.includes(text)) return true;

  const bigrams = (value: string) => {
    const set = new Set<string>();
    for (let i = 0; i < value.length - 1; i++) {
      set.add(value.slice(i, i + 2));
    }
    return set;
  };

  const captionBigrams = bigrams(caption);
  const textBigrams = bigrams(text);
  let overlap = 0;
  for (const bigram of captionBigrams) {
    if (textBigrams.has(bigram)) {
      overlap++;
    }
  }

  const dice =
    (2 * overlap) / (captionBigrams.size + textBigrams.size || Number.POSITIVE_INFINITY);
  return dice >= 0.7;
};

const deduplicateCaptionText = (blocks: ContentBlock[]): ContentBlock[] => {
  const result: ContentBlock[] = [];

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    result.push(block);

    if (block.type !== BlockType.FIGURE_CAPTION) continue;

    let nextIndex = index + 1;
    let textChecks = 0;

    while (
      nextIndex < blocks.length &&
      textChecks < CAPTION_DUPLICATE_LOOKAHEAD_TEXT_BLOCKS
    ) {
      const nextBlock = blocks[nextIndex];
      if (nextBlock.type !== BlockType.TEXT) break;

      textChecks++;
      if (!isDuplicateOfCaption(block.text, nextBlock.text)) {
        result.push(nextBlock);
      }
      nextIndex++;
    }

    index = nextIndex - 1;
  }

  return result;
};

const isSameColumnContinuation = (
  previous: ContentBlock["boundingBox"],
  next: ContentBlock["boundingBox"],
): boolean => {
  const verticalGap = next.top - boxBottom(previous);
  return (
    horizontalOverlapRatio(previous, next) >= SAME_COLUMN_MIN_OVERLAP_RATIO &&
    Math.abs(previous.left - next.left) <= SAME_COLUMN_MAX_LEFT_DELTA &&
    verticalGap >= -0.02 &&
    verticalGap <=
      Math.max(previous.height, next.height) * SAME_COLUMN_MAX_VERTICAL_GAP_FACTOR
  );
};

const isColumnWrapContinuation = (
  previous: ContentBlock["boundingBox"],
  next: ContentBlock["boundingBox"],
): boolean => {
  const widthSimilarity =
    Math.min(previous.width, next.width) / Math.max(previous.width, next.width);
  const resetToUpperPage =
    next.top < COLUMN_WRAP_TOP_RESET_THRESHOLD &&
    boxBottom(previous) > COLUMN_WRAP_PREVIOUS_BOTTOM_THRESHOLD;
  const verticalReset =
    next.top + Math.max(next.height, COLUMN_WRAP_MIN_HEIGHT_FALLBACK) <
      previous.top || resetToUpperPage;

  return (
    horizontalOverlapRatio(previous, next) <= COLUMN_WRAP_MAX_OVERLAP_RATIO &&
    widthSimilarity >= COLUMN_WRAP_MIN_WIDTH_SIMILARITY &&
    next.left - previous.left >= COLUMN_WRAP_MIN_LEFT_SHIFT &&
    verticalReset
  );
};

const continuationHintScore = (
  previousText: string,
  nextText: string,
): number => {
  const previous = previousText.trimEnd();
  const next = nextText.trimStart();
  if (!previous || !next) return 0;
  if (SENTENCE_END_REGEX.test(previous) && !previous.endsWith("-")) return 0;

  let score = 0;

  if (!SENTENCE_END_REGEX.test(previous)) score += 1;
  if (CONTINUATION_PUNCTUATION_REGEX.test(previous)) score += 1;

  const lastWord = previous.match(LAST_WORD_REGEX)?.[1]?.toLocaleLowerCase();
  if (lastWord && CONTINUATION_END_WORDS.has(lastWord)) {
    score += 1;
  }

  if (
    STARTS_WITH_LOWERCASE_REGEX.test(next) ||
    STARTS_WITH_FRAGMENT_REGEX.test(next)
  ) {
    score += 1;
  }

  return score;
};

const shouldMergeTextBlocks = (
  previous: ContentBlock,
  next: ContentBlock,
): boolean => {
  if (previous.type !== BlockType.TEXT || next.type !== BlockType.TEXT) {
    return false;
  }

  const layoutMatches =
    isSameColumnContinuation(previous.boundingBox, next.boundingBox) ||
    isColumnWrapContinuation(previous.boundingBox, next.boundingBox);
  if (!layoutMatches) {
    return false;
  }

  return continuationHintScore(previous.text, next.text) >= TEXT_CONTINUATION_MIN_SCORE;
};

const joinContinuationText = (previousText: string, nextText: string): string => {
  const previous = previousText.trimEnd();
  const next = nextText.trimStart();
  if (!previous) return next;
  if (!next) return previous;

  if (previous.endsWith("-") && LETTER_START_REGEX.test(next)) {
    if (STARTS_WITH_LOWERCASE_REGEX.test(next)) {
      return previous.slice(0, -1) + next;
    }
    return previous + next;
  }

  if (STARTS_WITH_FRAGMENT_REGEX.test(next)) {
    return previous + next;
  }

  return `${previous} ${next}`;
};

const mergeTextContinuations = (blocks: ContentBlock[]): ContentBlock[] => {
  const result: ContentBlock[] = [];

  for (const block of blocks) {
    const previous = result.at(-1);
    if (previous && shouldMergeTextBlocks(previous, block)) {
      result[result.length - 1] = {
        ...previous,
        text: joinContinuationText(previous.text, block.text),
        confidence: (previous.confidence + block.confidence) / 2,
        boundingBox: mergeBoundingBoxes(
          previous.boundingBox,
          block.boundingBox,
        ),
      };
      continue;
    }

    result.push(block);
  }

  return result;
};

export const postprocessReorderedBlocks = (
  blocks: ContentBlock[],
): ContentBlock[] =>
  mergeTextContinuations(deduplicateCaptionText(snapCaptionsToFigures(blocks)));
