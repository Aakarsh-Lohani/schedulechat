"use client";

import React, { useMemo } from "react";
import styles from "./MarkdownContent.module.scss";

interface MarkdownContentProps {
  content: string;
}

/**
 * Parses inline formatting: **bold**, *italic*, `code`.
 */
function renderInlineText(text: string): React.ReactNode[] {
  // Regex splitting by code tokens, bold tokens, italic tokens
  const parts: React.ReactNode[] = [];
  // Tokenize regex
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    const token = match[0];
    if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(<code key={match.index}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else if (
      (token.startsWith("*") && token.endsWith("*")) ||
      (token.startsWith("_") && token.endsWith("_"))
    ) {
      parts.push(<em key={match.index}>{token.slice(1, -1)}</em>);
    } else {
      parts.push(token);
    }
    lastIdx = regex.lastIndex;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return parts;
}

/**
 * Normalizes markdown text so inline section headings like "summary: ### **Today's Focus** - **item**"
 * are expanded with proper line breaks before block parsing.
 */
function normalizeMarkdown(text: string): string {
  return text
    // Ensure headings have a leading newline
    .replace(/([^\n])\s*(#{1,6}\s+)/g, "$1\n\n$2")
    // Ensure horizontal rules have newlines
    .replace(/([^\n])\s*(---\s*)/g, "$1\n\n---\n\n")
    // Ensure bullet points have a leading newline if preceded by non-newline
    .replace(/([^\n])\s*(-\s+\*\*)/g, "$1\n$2")
    .replace(/([^\n])\s*(-\s+)/g, "$1\n$2");
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  const blocks = useMemo(() => {
    const normalized = normalizeMarkdown(content.trim());
    const lines = normalized.split("\n");
    const result: React.ReactNode[] = [];

    let currentList: string[] = [];
    let inCodeBlock = false;
    let codeBlockLang = "";
    let codeBlockLines: string[] = [];

    function flushList() {
      if (currentList.length > 0) {
        result.push(
          <ul key={`ul-${result.length}`}>
            {currentList.map((item, idx) => (
              <li key={idx}>{renderInlineText(item)}</li>
            ))}
          </ul>
        );
        currentList = [];
      }
    }

    function flushCodeBlock() {
      if (codeBlockLines.length > 0) {
        result.push(
          <pre key={`pre-${result.length}`}>
            <code className={codeBlockLang ? `language-${codeBlockLang}` : undefined}>
              {codeBlockLines.join("\n")}
            </code>
          </pre>
        );
        codeBlockLines = [];
      }
      inCodeBlock = false;
      codeBlockLang = "";
    }

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i] ?? "";
      const line = rawLine.trim();

      // Code block start / end
      if (line.startsWith("```")) {
        if (inCodeBlock) {
          flushCodeBlock();
        } else {
          flushList();
          inCodeBlock = true;
          codeBlockLang = line.slice(3).trim();
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockLines.push(rawLine);
        continue;
      }

      // Empty line
      if (!line) {
        flushList();
        continue;
      }

      // Horizontal rule
      if (line === "---" || line === "***" || line === "___") {
        flushList();
        result.push(<hr key={`hr-${result.length}`} />);
        continue;
      }

      // Headings
      if (line.startsWith("#")) {
        flushList();
        const level = (line.match(/^#+/) || ["#"])[0].length;
        const text = line.replace(/^#+\s*/, "");
        if (level === 1) result.push(<h1 key={`h1-${result.length}`}>{renderInlineText(text)}</h1>);
        else if (level === 2) result.push(<h2 key={`h2-${result.length}`}>{renderInlineText(text)}</h2>);
        else if (level === 3) result.push(<h3 key={`h3-${result.length}`}>{renderInlineText(text)}</h3>);
        else result.push(<h4 key={`h4-${result.length}`}>{renderInlineText(text)}</h4>);
        continue;
      }

      // Bullet lists (- or *)
      if (/^[-*]\s+/.test(line)) {
        const itemText = line.replace(/^[-*]\s+/, "");
        currentList.push(itemText);
        continue;
      }

      // Numbered lists (1. , 2. )
      if (/^\d+\.\s+/.test(line)) {
        flushList();
        const itemText = line.replace(/^\d+\.\s+/, "");
        currentList.push(itemText);
        continue;
      }

      // Regular paragraph line
      flushList();
      result.push(<p key={`p-${result.length}`}>{renderInlineText(line)}</p>);
    }

    flushList();
    flushCodeBlock();

    return result;
  }, [content]);

  return <div className={styles.markdown}>{blocks}</div>;
}
