import { describe, expect, it } from "vitest";
import { getMarkdownPreviewSearchText, splitMarkdownSearchText } from "./markdown-search-text";

describe("getMarkdownPreviewSearchText", () => {
  it("indexes rendered Markdown text without source markers or link destinations", () => {
    expect(
      getMarkdownPreviewSearchText(
        "# Visible heading\n\nRead **strong words** and [the guide](https://example.com/hidden-target).",
      ),
    ).toBe("Visible heading\nRead \nstrong words\n and \nthe guide\n.");
  });

  it("includes visible code and collapsed details summaries", () => {
    expect(
      getMarkdownPreviewSearchText(
        "Use `inlineValue`.\n\n```ts\nconst target = true;\n```\n\n<details><summary>More info</summary>Hidden body</details>",
      ),
    ).toBe("Use \ninlineValue\n.\nconst target = true;\nMore info");
  });

  it("splits case-insensitive literal matches for native highlighting", () => {
    expect(splitMarkdownSearchText("First NEEDLE, second needle.", "needle")).toEqual([
      { text: "First ", isMatch: false, from: 0 },
      { text: "NEEDLE", isMatch: true, from: 6 },
      { text: ", second ", isMatch: false, from: 12 },
      { text: "needle", isMatch: true, from: 21 },
      { text: ".", isMatch: false, from: 27 },
    ]);
    expect(splitMarkdownSearchText("a+b and a+b", "a+b")).toEqual([
      { text: "a+b", isMatch: true, from: 0 },
      { text: " and ", isMatch: false, from: 3 },
      { text: "a+b", isMatch: true, from: 8 },
    ]);
  });
});
