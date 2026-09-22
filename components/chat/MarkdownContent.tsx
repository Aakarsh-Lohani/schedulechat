"use client";

import React, { useMemo, useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import styles from "./MarkdownContent.module.scss";

interface MarkdownContentProps {
  content: string;
  className?: string;
  allowMermaid?: boolean;
}

/**
 * Parses inline formatting: **bold**, *italic*, `code`, and [link](url).
 */
function renderInlineText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;
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
    } else if (token.startsWith("[") && token.includes("](")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch && linkMatch[1] && linkMatch[2]) {
        parts.push(
          <a
            key={match.index}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
          >
            {renderInlineText(linkMatch[1])}
          </a>
        );
      } else {
        parts.push(token);
      }
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

function MermaidBlock({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [showCode, setShowCode] = useState<boolean>(false);
  const id = useRef(`mermaid-${Math.random().toString(36).substring(2, 9)}`);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const m = (await import("mermaid")).default;
        m.initialize({
          startOnLoad: false,
          theme: "dark",
          suppressErrorRendering: true,
        });

        const { svg: renderedSvg } = await m.render(id.current, chart);
        if (isMounted) {
          setSvg(renderedSvg);
          setError("");
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || "Failed to render diagram");
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [chart]);

  if (error) {
    return (
      <div className={styles.mermaidErrorCard}>
        <div className={styles.mermaidErrorHeader}>
          <AlertCircle size={13} />
          <span>Diagram Render Error</span>
          <button
            type="button"
            className={styles.mermaidToggleBtn}
            onClick={() => setShowCode((v) => !v)}
          >
            {showCode ? "Hide code" : "View code"}
          </button>
        </div>
        <div className={styles.mermaidErrorMsg}>{error}</div>
        {showCode && (
          <pre className={styles.mermaidErrorPre}>
            <code>{chart}</code>
          </pre>
        )}
      </div>
    );
  }

  return (
    <div
      className={styles.mermaidWrap}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function MarkdownContent({ content, className, allowMermaid = true }: MarkdownContentProps) {
  const blocks = useMemo(() => {
    const lines = content.trim().split("\n");
    const result: React.ReactNode[] = [];

    let currentList: string[] = [];
    let currentOrderedList: string[] = [];
    
    let inCodeBlock = false;
    let codeBlockLang = "";
    let codeBlockLines: string[] = [];

    let currentBlockquote: string[] = [];

    // Table state
    let tableHeaders: string[] = [];
    let tableAlignments: React.CSSProperties["textAlign"][] = [];
    let tableRows: string[][] = [];
    let inTable = false;

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

    function flushOrderedList() {
      if (currentOrderedList.length > 0) {
        result.push(
          <ol key={`ol-${result.length}`}>
            {currentOrderedList.map((item, idx) => (
              <li key={idx}>{renderInlineText(item)}</li>
            ))}
          </ol>
        );
        currentOrderedList = [];
      }
    }

    function flushBlockquote() {
      if (currentBlockquote.length > 0) {
        result.push(
          <blockquote key={`bq-${result.length}`}>
            {currentBlockquote.map((item, idx) => (
              <div key={idx}>{renderInlineText(item)}</div>
            ))}
          </blockquote>
        );
        currentBlockquote = [];
      }
    }

    function flushTable() {
      if (inTable && tableHeaders.length > 0) {
        result.push(
          <div className={styles.tableWrap} key={`table-${result.length}`}>
            <table>
              <thead>
                <tr>
                  {tableHeaders.map((header, idx) => (
                    <th key={idx} style={{ textAlign: tableAlignments[idx] || "left" }}>
                      {renderInlineText(header)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} style={{ textAlign: tableAlignments[cIdx] || "left" }}>
                        {renderInlineText(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      inTable = false;
      tableHeaders = [];
      tableAlignments = [];
      tableRows = [];
    }

    function flushAllTextBlocks() {
      flushList();
      flushOrderedList();
      flushBlockquote();
      flushTable();
    }

    function flushCodeBlock() {
      if (codeBlockLines.length > 0) {
        const code = codeBlockLines.join("\n");
        if (codeBlockLang === "mermaid" && allowMermaid !== false) {
          result.push(<MermaidBlock key={`mermaid-${result.length}`} chart={code} />);
        } else {
          result.push(
            <pre key={`pre-${result.length}`}>
              <code className={codeBlockLang ? `language-${codeBlockLang}` : undefined}>
                {code}
              </code>
            </pre>
          );
        }
        codeBlockLines = [];
      }
      inCodeBlock = false;
      codeBlockLang = "";
    }

    const isTableSeparator = (l: string | undefined): boolean => {
      if (!l) return false;
      const t = l.trim();
      if (!t.includes("|") || !t.includes("-")) return false;
      const inner = t.replace(/^\|/, "").replace(/\|$/, "");
      const parts = inner.split("|");
      return parts.length >= 1 && parts.every((p) => /^\s*:?-{2,}:?\s*$/.test(p));
    };

    const parseTableRow = (rLine: string) => {
      let cleaned = rLine.trim();
      if (cleaned.startsWith("|")) cleaned = cleaned.slice(1);
      if (cleaned.endsWith("|")) cleaned = cleaned.slice(0, -1);
      return cleaned.split("|").map((cell) => cell.trim());
    };

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i] ?? "";
      const line = rawLine.trim();

      if (line.startsWith("```")) {
        if (inCodeBlock) {
          flushCodeBlock();
        } else {
          flushAllTextBlocks();
          inCodeBlock = true;
          codeBlockLang = line.slice(3).trim();
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockLines.push(rawLine);
        continue;
      }

      if (!line) {
        flushAllTextBlocks();
        continue;
      }

      if (
        line === "---" ||
        line === "***" ||
        line === "___" ||
        /^---+$/.test(line) ||
        /^\*\*\*+$/.test(line) ||
        /^___+$/.test(line)
      ) {
        flushAllTextBlocks();
        result.push(<hr key={`hr-${result.length}`} />);
        continue;
      }

      if (line.startsWith("#")) {
        flushAllTextBlocks();
        const level = (line.match(/^#+/) || ["#"])[0].length;
        const text = line.replace(/^#+\s*/, "");
        if (level === 1) result.push(<h1 key={`h1-${result.length}`}>{renderInlineText(text)}</h1>);
        else if (level === 2) result.push(<h2 key={`h2-${result.length}`}>{renderInlineText(text)}</h2>);
        else if (level === 3) result.push(<h3 key={`h3-${result.length}`}>{renderInlineText(text)}</h3>);
        else result.push(<h4 key={`h4-${result.length}`}>{renderInlineText(text)}</h4>);
        continue;
      }

      if (line.startsWith("> ")) {
        flushList();
        flushOrderedList();
        flushTable();
        currentBlockquote.push(line.slice(2).trim());
        continue;
      }

      if (/^[-*]\s+/.test(line)) {
        flushOrderedList();
        flushBlockquote();
        flushTable();
        const itemText = line.replace(/^[-*]\s+/, "");
        currentList.push(itemText);
        continue;
      }

      if (/^\d+\.\s+/.test(line)) {
        flushList();
        flushBlockquote();
        flushTable();
        const itemText = line.replace(/^\d+\.\s+/, "");
        currentOrderedList.push(itemText);
        continue;
      }

      if (line.startsWith("|")) {
        flushList();
        flushOrderedList();
        flushBlockquote();
        
        if (!inTable) {
          const nextLine = lines[i + 1]?.trim();
          if (isTableSeparator(nextLine)) {
            inTable = true;
            tableHeaders = parseTableRow(line);
            
            const aligns = parseTableRow(nextLine!);
            tableAlignments = aligns.map((a) => {
              const start = a.startsWith(":");
              const end = a.endsWith(":");
              if (start && end) return "center";
              if (end) return "right";
              return "left";
            });
            i++; 
            continue;
          } else {
            flushAllTextBlocks();
            result.push(<p key={`p-${result.length}`}>{renderInlineText(line)}</p>);
            continue;
          }
        } else {
          if (isTableSeparator(line)) {
            continue;
          }
          tableRows.push(parseTableRow(line));
          continue;
        }
      }

      flushAllTextBlocks();
      result.push(<p key={`p-${result.length}`}>{renderInlineText(line)}</p>);
    }

    flushAllTextBlocks();
    flushCodeBlock();

    return result;
  }, [content, allowMermaid]);

  return <div className={`${styles.markdown} ${className ?? ""}`}>{blocks}</div>;
}
