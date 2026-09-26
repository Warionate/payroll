/**
 * マークダウン記号を除去してプレーンテキストに変換
 * プレビューやプッシュ通知など、マークダウンをレンダリングできない場所で使用
 */
export function stripMarkdown(text: string | null | undefined): string {
  if (!text) return '';

  return (
    text
      // Headers
      .replace(/^#{1,6}\s+/gm, '')
      // Bold and italic
      .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/___(.+?)___/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/_(.+?)_/g, '$1')
      // Strikethrough
      .replace(/~~(.+?)~~/g, '$1')
      // Links [text](url)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Images ![alt](url)
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      // Inline code
      .replace(/`([^`]+)`/g, '$1')
      // Code blocks
      .replace(/```[\s\S]*?```/g, '')
      // Blockquotes
      .replace(/^>\s+/gm, '')
      // Horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, '')
      // Unordered list markers
      .replace(/^[\s]*[-*+]\s+/gm, '• ')
      // Ordered list markers
      .replace(/^[\s]*\d+\.\s+/gm, '')
      // Multiple newlines to single
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
