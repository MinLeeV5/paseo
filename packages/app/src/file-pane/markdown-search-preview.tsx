import { useEffect, useMemo, type ReactNode } from "react";
import type { ASTNode, RenderRules } from "react-native-markdown-display";
import { type TextStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  createSharedMarkdownRules,
  MarkdownInheritedText,
  MarkdownRenderer,
  type MarkdownStyles,
} from "@/components/markdown/renderer";
import { findFileSearchMatches } from "./search";
import { getMarkdownPreviewSearchText, splitMarkdownSearchText } from "./markdown-search-text";
import type { FileSearchController } from "./use-search";

export function MarkdownSearchPreview({
  text,
  search,
}: {
  text: string;
  search?: FileSearchController;
}) {
  const isSearchOpen = search?.isOpen ?? false;
  const query = search?.query ?? "";
  const reportRenderedMatchCount = search?.reportRenderedMatchCount;
  const searchableText = useMemo(() => getMarkdownPreviewSearchText(text), [text]);
  const matchCount = useMemo(
    () => findFileSearchMatches(searchableText, query).length,
    [query, searchableText],
  );

  useEffect(() => {
    reportRenderedMatchCount?.(isSearchOpen ? matchCount : 0);
  }, [isSearchOpen, matchCount, reportRenderedMatchCount]);

  const rules = createMarkdownSearchRules({
    query: isSearchOpen ? query : "",
    currentIndex: search?.currentIndex ?? -1,
  });
  return <MarkdownRenderer text={text} rules={rules} />;
}

function createMarkdownSearchRules(input: { query: string; currentIndex: number }): RenderRules {
  const rules = createSharedMarkdownRules();
  let matchIndex = 0;

  function renderSearchableText(
    node: ASTNode,
    styles: MarkdownStyles,
    inheritedStyles: TextStyle,
    monoSurface: boolean,
  ): ReactNode {
    const segments = splitMarkdownSearchText(node.content ?? "", input.query);
    return (
      <MarkdownInheritedText
        key={node.key}
        inheritedStyles={inheritedStyles}
        textStyle={monoSurface ? styles.code_inline : styles.text}
        monoSurface={monoSurface}
      >
        {segments.map((segment) => {
          const segmentMatchIndex = segment.isMatch ? matchIndex : -1;
          if (segment.isMatch) {
            matchIndex += 1;
          }
          const segmentStyle = getMarkdownSearchSegmentStyle({
            isMatch: segment.isMatch,
            matchIndex: segmentMatchIndex,
            currentIndex: input.currentIndex,
          });
          return (
            <MarkdownInheritedText
              key={`${node.key}-${segment.from}-${segment.isMatch ? "match" : "text"}`}
              inheritedStyles={inheritedStyles}
              textStyle={monoSurface ? styles.code_inline : styles.text}
              style={segmentStyle}
              monoSurface={monoSurface}
            >
              {segment.text}
            </MarkdownInheritedText>
          );
        })}
      </MarkdownInheritedText>
    );
  }

  return {
    ...rules,
    text: (
      node: ASTNode,
      _children: ReactNode[],
      _parent: ASTNode[],
      styles: MarkdownStyles,
      inheritedStyles: TextStyle = {},
    ) => renderSearchableText(node, styles, inheritedStyles, false),
    code_inline: (
      node: ASTNode,
      _children: ReactNode[],
      _parent: ASTNode[],
      styles: MarkdownStyles,
      inheritedStyles: TextStyle = {},
    ) => renderSearchableText(node, styles, inheritedStyles, true),
  };
}

function getMarkdownSearchSegmentStyle(input: {
  isMatch: boolean;
  matchIndex: number;
  currentIndex: number;
}) {
  if (!input.isMatch) {
    return undefined;
  }
  return input.matchIndex === input.currentIndex
    ? markdownSearchStyles.current
    : markdownSearchStyles.match;
}

const markdownSearchStyles = StyleSheet.create((theme) => ({
  match: {
    backgroundColor: theme.colors.accentBorder,
  },
  current: {
    color: theme.colors.accentForeground,
    backgroundColor: theme.colors.accent,
  },
}));
