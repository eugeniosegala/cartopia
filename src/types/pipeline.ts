export type SortOrder = "name" | "date";

export type ThinkingEffort = "none" | "low" | "medium" | "high";

export interface PipelineConfig {
  inputDir: string;
  outputPath: string;
  concurrency: number;
  awsRegion: string;
  sortOrder: SortOrder;
  maxPages?: number;
  translateLanguage?: string;
  thinkingEffort?: ThinkingEffort;
  verbose: boolean;
}
