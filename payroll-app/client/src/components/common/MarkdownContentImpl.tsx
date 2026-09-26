import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkEmoji from 'remark-emoji';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';

// KaTeX / highlight.js の CSS もこのチャンクに同梱し、
// Markdown を実際に表示するまで読み込まないようにする
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';

interface Props {
  content: string;
  className?: string;
}

export default function MarkdownContentImpl({ content, className = '' }: Props) {
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkEmoji]}
        rehypePlugins={[
          [
            rehypeKatex,
            {
              output: 'html',
              trust: false,
              strict: false,
            },
          ],
          [
            rehypeHighlight,
            {
              detect: true,
              ignoreMissing: true,
            },
          ],
        ]}
        components={{
          // リンクは新しいタブで開く
          a: ({ ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            />
          ),
          // 画像はレスポンシブ対応
          img: ({ ...props }) => (
            <img {...props} className="max-w-full h-auto rounded-lg my-2" loading="lazy" />
          ),
          // コードブロックのスタイリング
          code: ({ className, children, ...props }) => {
            // ハイライトされたコードブロックには既にhljs-*のクラスが付いている
            return !className ? (
              <code
                className="bg-gray-100 text-red-600 px-1.5 py-0.5 rounded text-sm font-mono"
                {...props}
              >
                {children}
              </code>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
