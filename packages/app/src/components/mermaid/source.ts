const FLOWCHART_HEADER = /^\s*(?:flowchart(?:-elk)?|graph)\b/m;
const QUOTED_STRING_OR_SLASH_COMMAND_NODE =
  /"[^"\r\n]*"|([A-Za-z_][A-Za-z0-9_-]*)\[\/([A-Za-z0-9][A-Za-z0-9:_-]*(?:[ \t][^"[\]\r\n]*)?)\]/g;

function normalizeSlashCommandNode(
  match: string,
  nodeId: string | undefined,
  label: string | undefined,
): string {
  if (!nodeId || !label || label.endsWith("/") || label.endsWith("\\")) {
    return match;
  }
  // The space keeps the label unquoted while preventing `[/` from opening a slanted shape.
  return `${nodeId}[ /${label}]`;
}

export function normalizeMermaidSource(source: string): string {
  if (!FLOWCHART_HEADER.test(source)) {
    return source;
  }
  return source.replace(QUOTED_STRING_OR_SLASH_COMMAND_NODE, normalizeSlashCommandNode);
}
