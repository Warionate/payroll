import { AxiosError } from 'axios';

// サーバー由来のメッセージはユーザー向けに書かれた日本語のときだけそのまま表示し、
// 英語の内部メッセージや axios の "Network Error" / ステータスコードは表に出さない。
const JAPANESE_RE = /[぀-ヿ㐀-鿿]/;

/**
 * エラーからユーザーに見せられる「理由」を取り出す。
 * 判別できない場合は null を返し、呼び出し側の文脈メッセージだけを表示させる。
 */
export function getApiErrorReason(error: unknown): string | null {
  const axiosErr = error as AxiosError<{ error?: string }> | undefined;
  const res = axiosErr?.response;

  const serverMessage = res?.data?.error;
  if (typeof serverMessage === 'string' && JAPANESE_RE.test(serverMessage)) {
    return serverMessage;
  }

  if (!res) {
    // アプリ内で日本語メッセージ付きで throw された Error はそのまま見せる
    if (error instanceof Error && JAPANESE_RE.test(error.message)) {
      return error.message;
    }
    if (!axiosErr?.isAxiosError) return null;
    if (axiosErr.code === 'ECONNABORTED') {
      return 'サーバーの応答がありません。時間をおいて再度お試しください';
    }
    return '通信エラーが発生しました。接続を確認してください';
  }

  if (res.status === 503 && res.headers?.['x-maintenance'] === '1') {
    return 'メンテナンス中のため操作できません';
  }
  if (res.status >= 500) {
    return 'サーバーでエラーが発生しました。時間をおいて再度お試しください';
  }
  if (res.status === 429) {
    return 'リクエストが多すぎます。しばらく待ってから再度お試しください';
  }
  if (res.status === 403) {
    return 'この操作を行う権限がありません';
  }

  return null;
}

/**
 * トースト等に表示する日本語のエラーメッセージを組み立てる。
 * 例: formatApiError(err, '保存に失敗しました')
 *   → "保存に失敗しました: 通信エラーが発生しました。接続を確認してください"
 *   → "保存に失敗しました"（理由が判別できない場合）
 */
export function formatApiError(error: unknown, failureMessage: string): string {
  const reason = getApiErrorReason(error);
  return reason ? `${failureMessage}: ${reason}` : failureMessage;
}
