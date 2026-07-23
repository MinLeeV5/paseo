// @vitest-environment jsdom
import mermaid from "mermaid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeMermaidSource } from "./source";

const FLOWCHART_WITH_SLASH_COMMAND = `flowchart TD
    U[用户请求] --> G[AGENTS 写入授权门禁]
    G -->|明确动作指令| W[Direct / Lite / Full]
    G -->|明确讨论或模糊反馈| B[唯一 brainstorming skill]
    B --> C{输入成熟度}
    C -->|早期想法| D[Discover 发散]
    C -->|多个候选| P[Compare 比较]
    C -->|明确方案| H[Challenge 挑战]
    D --> S[Converge 收束]
    P --> S
    H --> S
    O[/opsx:explore] --> X[条件式 OpenSpec 上下文]
    X --> B
    S -->|新的明确写入授权| W`;

const svgElementPrototype = SVGElement.prototype as SVGElement & {
  getBBox?: () => DOMRect;
};
const svgTextElementPrototype = Object.getPrototypeOf(
  document.createElementNS("http://www.w3.org/2000/svg", "text"),
) as {
  getComputedTextLength?: () => number;
};

function createBBox(): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 100,
    height: 24,
    top: 0,
    right: 100,
    bottom: 24,
    left: 0,
    toJSON() {
      return {
        x: 0,
        y: 0,
        width: 100,
        height: 24,
        top: 0,
        right: 100,
        bottom: 24,
        left: 0,
      };
    },
  } as DOMRect;
}

beforeAll(() => {
  svgElementPrototype.getBBox = () => createBBox();
  svgTextElementPrototype.getComputedTextLength = () => 100;
});

afterAll(() => {
  delete svgElementPrototype.getBBox;
  delete svgTextElementPrototype.getComputedTextLength;
});

describe("Mermaid slash command labels", () => {
  it("renders an unquoted slash command as node text", async () => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      flowchart: { htmlLabels: false },
    });

    const result = await mermaid.render(
      "paseo-mermaid-slash-command-test",
      normalizeMermaidSource(FLOWCHART_WITH_SLASH_COMMAND),
    );
    const host = document.createElement("div");
    host.innerHTML = result.svg;

    expect(host.textContent).toContain("/opsx:explore");
    expect(host.textContent).toContain("条件式 OpenSpec 上下文");
  });
});
