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
    }
  }
}
