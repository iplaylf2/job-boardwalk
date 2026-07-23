import { platformIds } from "@job-boardwalk/platform-catalog";

import { contract } from "./contract.ts";

export const trimmedNonEmptyString = contract("string.trim.preformatted > 0");

export const normalizedNonEmptyText = contract("string")
  .pipe((value) => value.trim())
  .to("string > 0");

export const normalizedTimestamp = contract("string.date").pipe((value) =>
  new Date(value).toISOString(),
);

export const minimumNonEmptyArrayLength = 1;

export const nonNegativeInteger = contract("number.integer >= 0");

export const platformId = contract.enumerated(...platformIds);

export const positiveInteger = contract("number.integer >= 1");
