import { contract } from "./internal/contract.ts";
import {
  normalizedTimestamp,
  positiveInteger,
  trimmedNonEmptyString,
} from "./internal/contract-fields.ts";

export const ProfileFact = contract({
  confirmed: "boolean",
  id: positiveInteger,
  key: trimmedNonEmptyString,
  source: trimmedNonEmptyString,
  updatedAt: normalizedTimestamp,
  value: trimmedNonEmptyString,
});
export type ProfileFact = typeof ProfileFact.infer;
