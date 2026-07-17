import { configure } from "arktype/config";

// Strict object shapes are a package-wide wire-contract policy, not a per-schema option.
configure({ onUndeclaredKey: "reject" });
