// --- User & Auth ---

export interface User {
  id: number;
  /** ユーザー ID（ログインに使う） */
  username: string;
  /** 表示名（画面に出す名前） */
  display_name?: string | null;
  role: 'admin' | 'user';
  created_at: string;
  /** 最初の設定の期限（管理画面の一覧にだけ付く） */
  setup_deadline?: string | null;
  /** まだ済ませていない最初の設定（ログイン・/me の応答にだけ付く） */
  setup?: AccountSetup;
}

export interface AccountSetup {
  /** 確認済みのメールアドレスが要る */
  email: boolean;
  /** 二つ目の手段（パスキー・認証アプリ・Authentik）が要る */
  mfa: boolean;
  /** ユーザー ID を決め直す必要がある（文字種のルールに合わない） */
  loginId: boolean;
  /** この日時までに済ませないとアカウントが消える（新規登録した人だけ。ほかは null） */
  deadline?: string | null;
}

export type UserRole = 'admin' | 'user';
