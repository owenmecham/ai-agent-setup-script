'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const components: Components = {
  h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>,
  h2: ({ children }) => <h2 className="text-lg font-bold mt-3 mb-2">{children}</h2>,
  h3: ({ children }) => <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>,
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-zinc-600 pl-3 italic text-zinc-400 my-2">{children}</blockquote>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <code className="block bg-zinc-950 rounded-md p-3 my-2 text-sm max-w-full font-mono whitespace-pre-wrap break-words">
          {children}
        </code>
      );
    }
    return <code className="bg-zinc-700 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>;
  },
  pre: ({ children }) => <pre className="my-2 max-w-full">{children}</pre>,
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-zinc-700 px-3 py-1.5 text-left font-semibold bg-zinc-800">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-zinc-700 px-3 py-1.5">{children}</td>
  ),
  hr: () => <hr className="border-zinc-700 my-3" />,
};

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="text-sm text-zinc-200 prose-invert max-w-none break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
