// --- User & Auth ---

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'user';
  created_at: string;
}

export type UserRole = 'admin' | 'user';
