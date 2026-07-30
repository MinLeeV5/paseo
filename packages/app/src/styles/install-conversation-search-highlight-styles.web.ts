const STYLE_ID = "paseo-conversation-search-highlight-styles";
let installationCount = 0;

export function installConversationSearchHighlightStyles(): () => void {
  installationCount += 1;
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
::highlight(paseo-conversation-search-match) {
  background-color: color-mix(in srgb, var(--colors-accent) 28%, transparent);
}

::highlight(paseo-conversation-search-current) {
  color: var(--colors-accentForeground);
  background-color: var(--colors-accent);
}
`;
    document.head.append(style);
  }

  return () => {
    installationCount = Math.max(0, installationCount - 1);
    if (installationCount === 0) {
      document.getElementById(STYLE_ID)?.remove();
    }
  };
}
