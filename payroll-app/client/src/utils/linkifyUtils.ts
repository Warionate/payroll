/**
 * URLリンク化ユーティリティ
 * テキスト内のURLを検出してReactコンポーネントに変換
 */

import type { LinkPart } from '../types';

// 画像拡張子のリスト
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];

/**
 * URLが画像かどうかを判定
 * @param {string} url
 * @returns {boolean}
 */
export function isImageUrl(url: string): boolean {
  try {
    const pathname = url.toLowerCase();
    return IMAGE_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * 日本語日付形式（YYYY/MM/DD）をDateに変換
 * @param {string} dateStr
 * @returns {Date|null}
 */
function parseJapaneseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  // YYYY/MM/DD形式をパース
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }
  // フォールバック: そのままDateで解析
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * テキスト内のURLをリンク化したパーツ配列を返す
 * @param {string} text
 * @returns {Array<{type: 'text' | 'link' | 'image' | 'file', content: string, filename?: string}>}
 */
export function parseLinks(text: string): LinkPart[] {
  if (!text) return [];

  const parts: LinkPart[] = [];

  // まず行ごとに分割してファイル添付パターンを検出
  const lines = text.split('\n');

  lines.forEach((line: string, lineIndex: number) => {
    // ファイル添付パターン: 📎 ファイル名: /uploads/... [有効期限: YYYY/MM/DD] または無し
    const fileMatch = line.match(
      /^📎\s+(.+?):\s*(\/uploads\/[^\s[]+|https?:\/\/[^\s[]+)(?:\s*\[有効期限:\s*([^\]]+)\])?$/,
    );

    if (fileMatch) {
      const expiresAt = fileMatch[3] ? parseJapaneseDate(fileMatch[3]) : null;
      const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;

      parts.push({
        type: 'file',
        filename: fileMatch[1],
        content: fileMatch[2],
        expiresAt: expiresAt,
        isExpired: isExpired,
      });
    } else {
      // 通常のURL検出（http(s):// または /uploads/ パス）
      let lastIndex = 0;
      let match;
      const lineRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+|\/uploads\/[^\s<>"{}|\\^`[\]]+)/gi;

      while ((match = lineRegex.exec(line)) !== null) {
        // マッチ前のテキスト
        if (match.index > lastIndex) {
          parts.push({
            type: 'text',
            content: line.slice(lastIndex, match.index),
          });
        }

        const url = match[0];

        // 画像URLかどうかで分類
        if (isImageUrl(url)) {
          parts.push({
            type: 'image',
            content: url,
          });
        } else {
          parts.push({
            type: 'link',
            content: url,
          });
        }

        lastIndex = match.index + url.length;
      }

      // 残りのテキスト
      if (lastIndex < line.length) {
        parts.push({
          type: 'text',
          content: line.slice(lastIndex),
        });
      }
    }

    // 行間に改行を追加（最後の行以外）
    if (lineIndex < lines.length - 1) {
      parts.push({
        type: 'text',
        content: '\n',
      });
    }
  });

  return parts;
}

/**
 * ファイル名から拡張子を取得
 * @param {string} filename
 * @returns {string}
 */
export function getFileExtension(filename: string): string {
  if (!filename) return '';
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.slice(lastDot).toLowerCase() : '';
}

/**
 * ファイルタイプに応じたアイコン名を返す
 * @param {string} mimetype
 * @returns {'image' | 'document' | 'file'}
 */
export function getFileIconType(mimetype: string): 'image' | 'document' | 'file' {
  if (!mimetype) return 'file';
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.includes('pdf') || mimetype.includes('word') || mimetype.includes('document'))
    return 'document';
  if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) return 'document';
  return 'file';
}

/**
 * /uploads/パスをダウンロードエンドポイントに変換
 * @param {string} url
 * @returns {string}
 */
export function getDownloadUrl(url: string): string {
  if (!url) return url;
  // /uploads/filename -> /api/uploads/download/filename
  const match = url.match(/^\/uploads\/(.+)$/);
  if (match) {
    return `/api/uploads/download/${match[1]}`;
  }
  return url;
}
