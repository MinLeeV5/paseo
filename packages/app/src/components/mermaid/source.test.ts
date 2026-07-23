import { describe, expect, it } from "vitest";
import { normalizeMermaidSource } from "./source";

describe("normalizeMermaidSource", () => {
  it("separates slash command labels from Mermaid shape syntax", () => {
    const source = ["flowchart TD", "    O[/opsx:explore] --> X[条件式 OpenSpec 上下文]"].join(
      "\n",
    );

    expect(normalizeMermaidSource(source)).toBe(
      ["flowchart TD", "    O[ /opsx:explore] --> X[条件式 OpenSpec 上下文]"].join("\n"),
    );
  });

  it("preserves valid slanted node shapes", () => {
    const source = [
      "flowchart TD",
      "    A[/Parallelogram/] --> B[/Trapezoid\\]",
      "    C[\\Inverse parallelogram/] --> D[\\Inverse trapezoid\\]",
    ].join("\n");

    expect(normalizeMermaidSource(source)).toBe(source);
  });

  it("preserves slash command text that is already quoted", () => {
    const source = 'flowchart TD\n    O["/opsx:explore"] --> X';

    expect(normalizeMermaidSource(source)).toBe(source);
  });

  it("does not rewrite other Mermaid diagram types", () => {
    const source = "sequenceDiagram\n    Alice->>Bob: O[/opsx:explore]";

    expect(normalizeMermaidSource(source)).toBe(source);
  });
});
