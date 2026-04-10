#!/usr/bin/env node

import "dotenv/config";
import { Command, InvalidArgumentError } from "commander";
import { DEFAULT_CONCURRENCY } from "./config/pipeline.js";
import { processBook } from "./pipeline.js";
import type { SortOrder, ThinkingEffort } from "./types/pipeline.js";
import { toErrorMessage } from "./utils/error.js";
import * as log from "./utils/logger.js";

interface CliOptions {
  output: string;
  concurrency: number;
  region: string;
  sort: SortOrder;
  maxPages?: number;
  translate?: string;
  thinkingEffort?: ThinkingEffort;
  verbose: boolean;
}

const parsePositiveInteger = (value: string): number => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("must be a positive integer");
  }

  return parsed;
};

const parseSortOrder = (value: string): SortOrder => {
  if (value === "name" || value === "date") {
    return value;
  }

  throw new InvalidArgumentError("must be one of: name, date");
};

const VALID_THINKING_EFFORTS = ["none", "low", "medium", "high"] as const;

const parseThinkingEffort = (value: string): ThinkingEffort => {
  if (VALID_THINKING_EFFORTS.includes(value as ThinkingEffort)) {
    return value as ThinkingEffort;
  }

  throw new InvalidArgumentError(
    `must be one of: ${VALID_THINKING_EFFORTS.join(", ")}`,
  );
};

const program = new Command();

program
  .name("cartopia")
  .description(
    "Convert photos of physical books into structured Word documents",
  )
  .version("0.1.0")
  .argument("<input-folder>", "Path to folder containing page photos")
  .option("-o, --output <path>", "Output .docx file path", "./output.docx")
  .option(
    "-c, --concurrency <n>",
    "Max concurrent page-processing tasks",
    parsePositiveInteger,
    DEFAULT_CONCURRENCY,
  )
  .option(
    "-r, --region <region>",
    "AWS region",
    process.env.AWS_REGION ?? "us-east-1",
  )
  .option("-s, --sort <order>", "Sort order: name or date", parseSortOrder, "name")
  .option(
    "-n, --max-pages <n>",
    "Max number of pages to process (for testing)",
    parsePositiveInteger,
  )
  .option(
    "-t, --translate <language>",
    "Translate to target language (e.g., en, English)",
  )
  .option(
    "--thinking-effort <level>",
    "LLM thinking effort: none, low, medium, high",
    parseThinkingEffort,
  )
  .option("-v, --verbose", "Enable verbose logging", false)
  .action(async (inputDir: string, opts: CliOptions) => {
    try {
      await processBook({
        inputDir,
        outputPath: opts.output,
        concurrency: opts.concurrency,
        awsRegion: opts.region,
        sortOrder: opts.sort,
        maxPages: opts.maxPages,
        translateLanguage: opts.translate,
        thinkingEffort: opts.thinkingEffort,
        verbose: opts.verbose,
      });
    } catch (err) {
      log.error(toErrorMessage(err));
      process.exit(1);
    }
  });

program.parse();
