import { describe, expect, it } from "vitest";
import {
  filePreviewRenderKind,
  getDefaultFilePaneMarkdownMode,
  getFilePaneContentRenderMode,
  getFilePaneRenderMode,
  isRenderedMarkdownFile,
  isStandaloneMermaidFile,
} from "@/components/file-pane-render-mode";

describe("isRenderedMarkdownFile", () => {
  it("detects .md files", () => {
    expect(isRenderedMarkdownFile("README.md")).toBe(true);
    expect(isRenderedMarkdownFile("docs/guide.MD")).toBe(true);
  });

  it("detects .markdown files", () => {
    expect(isRenderedMarkdownFile("notes.markdown")).toBe(true);
    expect(isRenderedMarkdownFile("docs/CHANGELOG.MARKDOWN")).toBe(true);
  });

  it("does not treat .mdx files as rendered markdown", () => {
    expect(isRenderedMarkdownFile("page.mdx")).toBe(false);
  });

  it("does not treat other text files as rendered markdown", () => {
    expect(isRenderedMarkdownFile("src/index.ts")).toBe(false);
    expect(isRenderedMarkdownFile("README.md.txt")).toBe(false);
    expect(isRenderedMarkdownFile("plan.html")).toBe(false);
  });
});

describe("filePreviewRenderKind", () => {
  it("maps each renderable extension to its kind", () => {
    expect(filePreviewRenderKind("README.md")).toBe("markdown");
    expect(filePreviewRenderKind("notes.markdown")).toBe("markdown");
    expect(filePreviewRenderKind("plan.html")).toBe("html");
    expect(filePreviewRenderKind("docs/PLAN.HTML")).toBe("html");
    expect(filePreviewRenderKind("plan.htm")).toBe("html");
  });

  it("returns null for files without a rendered preview", () => {
    expect(filePreviewRenderKind("src/index.ts")).toBe(null);
    expect(filePreviewRenderKind("page.mdx")).toBe(null);
    expect(filePreviewRenderKind("index.html.erb")).toBe(null);
  });
});

describe("getFilePaneRenderMode", () => {
  it("renders Markdown files with the Markdown preview", () => {
    expect(getFilePaneRenderMode("README.md")).toBe("markdown");
    expect(getFilePaneRenderMode("docs/guide.markdown")).toBe("markdown");
  });

  it("renders standalone Mermaid files with the Mermaid preview", () => {
    expect(getFilePaneRenderMode("diagram.mmd")).toBe("mermaid");
    expect(getFilePaneRenderMode("docs/FLOW.MERMAID")).toBe("mermaid");
    expect(isStandaloneMermaidFile("docs/FLOW.MERMAID")).toBe(true);
  });

  it("renders non-preview text files as code", () => {
    expect(getFilePaneRenderMode("src/index.ts")).toBe("code");
    expect(isStandaloneMermaidFile("README.md")).toBe(false);
  });
});

describe("getFilePaneContentRenderMode", () => {
  it("defaults changed files to source while regular files default to preview", () => {
    expect(getDefaultFilePaneMarkdownMode(true)).toBe("source");
    expect(getDefaultFilePaneMarkdownMode(false)).toBe("preview");
  });

  it("forces previewable text files through code rendering when diff context is present", () => {
    expect(
      getFilePaneContentRenderMode({
        filePath: "README.md",
        hasLineSelection: false,
        hasDiffContext: true,
      }),
    ).toBe("code");
    expect(
      getFilePaneContentRenderMode({
        filePath: "diagram.mmd",
        hasLineSelection: false,
        hasDiffContext: true,
      }),
    ).toBe("code");
  });

  it("keeps regular preview behavior when no diff context is present", () => {
    expect(
      getFilePaneContentRenderMode({
        filePath: "README.md",
        hasLineSelection: false,
        hasDiffContext: false,
      }),
    ).toBe("markdown");
  });

  it("lets the file-pane control switch a diffed Markdown file between source and preview", () => {
    expect(
      getFilePaneContentRenderMode({
        filePath: "README.md",
        hasLineSelection: false,
        hasDiffContext: true,
        mode: "source",
      }),
    ).toBe("code");
    expect(
      getFilePaneContentRenderMode({
        filePath: "README.md",
        hasLineSelection: false,
        hasDiffContext: true,
        mode: "preview",
      }),
    ).toBe("markdown");
  });
});
