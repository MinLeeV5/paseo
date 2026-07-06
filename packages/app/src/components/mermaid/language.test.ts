import { describe, expect, it } from "vitest";
import { isMermaidFenceInfo, isStandaloneMermaidFile } from "./language";

describe("Mermaid preview language detection", () => {
  it("detects Mermaid code fence info strings", () => {
    expect(isMermaidFenceInfo("mermaid")).toBe(true);
    expect(isMermaidFenceInfo("mmd")).toBe(true);
    expect(isMermaidFenceInfo(".mermaid {theme=dark}")).toBe(true);
  });

  it("rejects non-Mermaid code fence info strings", () => {
    expect(isMermaidFenceInfo("typescript")).toBe(false);
    expect(isMermaidFenceInfo("markdown")).toBe(false);
    expect(isMermaidFenceInfo(null)).toBe(false);
  });

  it("detects standalone Mermaid file paths", () => {
    expect(isStandaloneMermaidFile("diagram.mmd")).toBe(true);
    expect(isStandaloneMermaidFile("docs/FLOW.MERMAID")).toBe(true);
    expect(isStandaloneMermaidFile("README.md")).toBe(false);
  });
});
