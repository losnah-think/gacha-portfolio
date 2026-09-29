import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import { cn } from '../utils/cn';

interface MarkdownProseProps {
  children: string;
  className?: string;
  fontSize?: number;
  align?: 'left' | 'center';
}

const markdownComponents: Components = {
  h1: ({ children }) => <h2 className="t-section my-4 text-toss-gray-900">{children}</h2>,
  h2: ({ children }) => <h3 className="t-section my-4 text-toss-gray-900">{children}</h3>,
  h3: ({ children }) => <h4 className="t-section my-4 text-toss-gray-900">{children}</h4>,
  p: ({ children }) => <p className="my-4">{children}</p>,
  strong: ({ children }) => <strong className="font-bold text-toss-gray-900">{children}</strong>,
  ul: ({ children }) => <ul className="my-4 list-disc space-y-2 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-4 list-decimal space-y-2 pl-5">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
};

export const MarkdownProse = ({
  children,
  className,
  fontSize,
  align = 'left',
}: MarkdownProseProps) => (
  <div
    className={cn(
      't-body-lg max-w-none break-words text-toss-gray-800',
      'prose prose-slate prose-headings:font-bold prose-strong:font-bold prose-p:leading-relaxed',
      align === 'center' ? 'text-center' : 'text-left',
      className,
    )}
    style={fontSize ? { fontSize: `${fontSize}px` } : undefined}
  >
    <ReactMarkdown components={markdownComponents}>{children}</ReactMarkdown>
  </div>
);
