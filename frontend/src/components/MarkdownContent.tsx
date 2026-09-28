"use client";

import { isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function extractText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(extractText).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractText(node.props.children);
  }

  return "";
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-300 transition hover:bg-white/10"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-sky-300 underline underline-offset-2"
            >
              {children}
            </a>
          ),
          pre: ({ children }) => {
            const text = extractText(children).replace(/\n$/, "");

            return (
              <div className="my-3 overflow-hidden rounded-xl border border-white/10 bg-[#0d0f14]">
                <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                  <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                    Code
                  </span>
                  <CopyButton text={text} />
                </div>
                <pre className="overflow-x-auto p-4 text-[13px] leading-6 text-zinc-200">
                  {children}
                </pre>
              </div>
            );
          },
          code: ({ children, className }) => {
            if (className) {
              return <code className={className}>{children}</code>;
            }

            return (
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em]">
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-white/10 bg-white/5 px-3 py-2 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-white/5 px-3 py-2 align-top">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
