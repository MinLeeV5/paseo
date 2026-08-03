import { isStandaloneMermaidFile } from "@/components/mermaid/language";

export type FilePaneRenderMode = "code" | "markdown" | "mermaid";
export type FilePaneMarkdownMode = "preview" | "source";

export type FilePreviewRenderKind = "markdown" | "html";

export function isRenderedMarkdownFile(filePath: string): boolean {
  const normalizedPath = filePath.trim().toLowerCase();
  return normalizedPath.endsWith(".md") || normalizedPath.endsWith(".markdown");
}

export function getFilePaneRenderMode(filePath: string): FilePaneRenderMode {
  if (isStandaloneMermaidFile(filePath)) {
    return "mermaid";
  }
  if (isRenderedMarkdownFile(filePath)) {
    return "markdown";
  }
  return "code";
}

export function getFilePaneContentRenderMode(input: {
  filePath: string;
  hasLineSelection: boolean;
  hasDiffContext: boolean;
  mode?: "preview" | "source";
}): FilePaneRenderMode {
  if (input.mode === "source") {
    return "code";
  }
  if (input.mode === "preview") {
    return getFilePaneRenderMode(input.filePath);
  }
  if (input.hasLineSelection || input.hasDiffContext) {
    return "code";
  }
  return getFilePaneRenderMode(input.filePath);
}

export function getDefaultFilePaneMarkdownMode(hasDiffContext: boolean): FilePaneMarkdownMode {
  return hasDiffContext ? "source" : "preview";
}

function isRenderedHtmlFile(filePath: string): boolean {
  const normalizedPath = filePath.trim().toLowerCase();
  return normalizedPath.endsWith(".html") || normalizedPath.endsWith(".htm");
}

export function filePreviewRenderKind(filePath: string): FilePreviewRenderKind | null {
  if (isRenderedMarkdownFile(filePath)) return "markdown";
  if (isRenderedHtmlFile(filePath)) return "html";
  return null;
}

export { isStandaloneMermaidFile };
