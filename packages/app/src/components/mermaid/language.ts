const MERMAID_FILE_EXTENSIONS = [".mmd", ".mermaid"] as const;
const MERMAID_FENCE_LANGUAGES = new Set(["mermaid", "mmd"]);

function normalizedExtension(path: string): string {
  const normalizedPath = path.trim().toLowerCase();
  const extensionIndex = normalizedPath.lastIndexOf(".");
  if (extensionIndex < 0) {
    return "";
  }
  return normalizedPath.slice(extensionIndex);
}

function normalizedFenceLanguage(info: string | null | undefined): string | null {
  if (!info) {
    return null;
  }
  const firstToken = info.trim().split(/\s+/, 1)[0];
  if (!firstToken) {
    return null;
  }
  return firstToken.replace(/^\./, "").toLowerCase();
}

export function isStandaloneMermaidFile(path: string): boolean {
  return MERMAID_FILE_EXTENSIONS.includes(
    normalizedExtension(path) as (typeof MERMAID_FILE_EXTENSIONS)[number],
  );
}

export function isMermaidFenceInfo(info: string | null | undefined): boolean {
  const language = normalizedFenceLanguage(info);
  return Boolean(language && MERMAID_FENCE_LANGUAGES.has(language));
}
