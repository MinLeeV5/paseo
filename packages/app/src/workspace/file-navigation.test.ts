import { describe, expect, it } from "vitest";
import { advanceWorkspaceFileNavigation } from "./file-navigation";

describe("advanceWorkspaceFileNavigation", () => {
  it("increments the reveal request for a reused file tab", () => {
    expect(
      advanceWorkspaceFileNavigation({ revision: 3 }, { mode: "source", lineNumber: 42 }),
    ).toEqual({
      revision: 4,
      reveal: { mode: "source", lineNumber: 42 },
    });
  });

  it("clears a stale source reveal on a normal file navigation", () => {
    expect(
      advanceWorkspaceFileNavigation({
        revision: 7,
        reveal: { mode: "source", lineNumber: 42 },
      }),
    ).toEqual({ revision: 8 });
  });
});
