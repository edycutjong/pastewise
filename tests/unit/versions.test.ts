import { describe, expect, it } from "vitest";
import { RC_DEFAULTS } from "@/lib/firebase";
import { GATE_VERSION } from "@/gate";

describe("versions agree", () => {
  it("the compiled Remote Config default for gate_rules_version is the shipped gate version", () => {
    expect(RC_DEFAULTS.gate_rules_version).toBe(GATE_VERSION);
  });
});
