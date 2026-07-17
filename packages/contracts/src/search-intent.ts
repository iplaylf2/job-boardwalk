import { contract } from "./internal/contract.ts";
import {
  minimumNonEmptyArrayLength,
  normalizedTimestamp,
  platformId,
  positiveInteger,
  trimmedNonEmptyString,
} from "./internal/contract-fields.ts";

export const RecommendationPageReference = contract({
  label: trimmedNonEmptyString,
  platformId,
  url: trimmedNonEmptyString,
});
export type RecommendationPageReference = typeof RecommendationPageReference.infer;

export const JobSearchIntent = contract({
  city: trimmedNonEmptyString,
  id: positiveInteger,
  name: trimmedNonEmptyString,
  position: trimmedNonEmptyString,
  recommendationPages: RecommendationPageReference.array().atLeastLength(
    minimumNonEmptyArrayLength,
  ),
  selected: "boolean",
  updatedAt: normalizedTimestamp,
});
export type JobSearchIntent = typeof JobSearchIntent.infer;
