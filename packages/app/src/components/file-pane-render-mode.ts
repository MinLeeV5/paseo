import { isStandaloneMermaidFile } from "@/components/mermaid/language";

export type FilePaneRenderMode = "code" | "markdown" | "mermaid";

function isMarkdownFile(filePath: string): boolean {
  const normalizedPath = filePath.trim().toLowerCase();
  return normalizedPath.endsWith(".md") || normalizedPath.endsWith(".markdown");
}

export function getFilePaneRenderMode(filePath: string): FilePaneRenderMode {
  if (isStandaloneMermaidFile(filePath)) {
    return "mermaid";
  }
  if (isMarkdownFile(filePath)) {
    return "markdown";
  }
  return "code";
}

export function isRenderedMarkdownFile(filePath: string): boolean {
  return getFilePaneRenderMode(filePath) === "markdown";
}

export { isStandaloneMermaidFile };
