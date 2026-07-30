import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import { splitHtmlishMarkdown, type MarkdownDisplayPart } from "@/components/markdown/html-ish";

const markdownParser = MarkdownIt({ typographer: true, linkify: true });

export interface MarkdownSearchTextSegment {
  text: string;
  isMatch: boolean;
  from: number;
}

export function getMarkdownPreviewSearchText(source: string): string {
  const chunks: string[] = [];
  appendParts(chunks, splitHtmlishMarkdown(source));
  return chunks.join("\n");
}

export function splitMarkdownSearchText(text: string, query: string): MarkdownSearchTextSegment[] {
  if (!query) {
    return [{ text, isMatch: false, from: 0 }];
  }
  const matcher = new RegExp(escapeRegExp(query), "giu");
  const segments: MarkdownSearchTextSegment[] = [];
  let offset = 0;
  let match = matcher.exec(text);
  while (match) {
    if (match.index > offset) {
      segments.push({ text: text.slice(offset, match.index), isMatch: false, from: offset });
    }
    segments.push({ text: match[0], isMatch: true, from: match.index });
    offset = match.index + match[0].length;
    match = matcher.exec(text);
  }
  if (offset < text.length) {
    segments.push({ text: text.slice(offset), isMatch: false, from: offset });
  }
  return segments;
}

function appendParts(chunks: string[], parts: MarkdownDisplayPart[]): void {
  for (const part of parts) {
    if (part.kind === "markdown") {
      appendTokens(chunks, markdownParser.parse(part.text, {}));
      continue;
    }
    if (part.kind === "details") {
      chunks.push(part.summary);
    }
  }
}

function appendTokens(chunks: string[], tokens: Token[]): void {
  for (const token of tokens) {
    if (token.type === "text" || token.type === "code_inline") {
      chunks.push(token.content);
      continue;
    }
    if (token.type === "fence" || token.type === "code_block") {
      chunks.push(...stripTerminalNewline(token.content).split("\n"));
      continue;
    }
    if (token.children) {
      appendTokens(chunks, token.children);
    }
  }
}

function stripTerminalNewline(value: string): string {
  return value.endsWith("\n") ? value.slice(0, -1) : value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
