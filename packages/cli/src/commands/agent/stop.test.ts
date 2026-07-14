import { describe, expect, it } from "vitest";
import { isAgentStopCandidate } from "./stop.js";

describe("isAgentStopCandidate", () => {
  it("stops active goals between turns", () => {
    expect(
      isAgentStopCandidate({ status: "idle", goal: { objective: "Ship it", status: "active" } }),
    ).toBe(true);
  });

  it("keeps idle agents and terminal goals as no-ops", () => {
    expect(isAgentStopCandidate({ status: "idle", goal: null })).toBe(false);
    expect(
      isAgentStopCandidate({
        status: "idle",
        goal: { objective: "Ship it", status: "complete" },
      }),
    ).toBe(false);
  });
});
