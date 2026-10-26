export interface AuthUser {
  id: number;
  username: string;
  role: 'admin' | 'user';
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      /** アクセストークンの sid（どのログインから来たか）。sessions 導入前のトークンには無い */
      sessionId?: string;
    }
  }
}
