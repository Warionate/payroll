import { Suspense, lazy } from 'react';

// react-markdown + KaTeX + highlight.js は合計で数百KB規模あるため、
// 実際に Markdown を表示するまでロードを遅延する（Layout 経由で
// 全ページから静的に参照されるので、静的 import だと初期バンドルに乗る）。
const MarkdownContentImpl = lazy(() => import('./MarkdownContentImpl'));

interface Props {
  content: string;
  className?: string;
}

export default function MarkdownContent({ content, className = '' }: Props) {
  if (!content) return null;

  return (
    <Suspense
      // ロード完了までは生テキストを表示してレイアウトの空白を防ぐ
      fallback={
        <div className={`markdown-content whitespace-pre-wrap ${className}`}>{content}</div>
      }
    >
      <MarkdownContentImpl content={content} className={className} />
    </Suspense>
  );
}
