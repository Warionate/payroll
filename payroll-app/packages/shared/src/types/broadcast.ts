// --- Broadcasts ---

import type { BroadcastCategory } from '../constants/broadcast.js';

export type { BroadcastCategory } from '../constants/broadcast.js';

export interface Broadcast {
  id: number;
  title: string;
  message: string;
  category: BroadcastCategory;
  created_by: number;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  send_push?: boolean;
  show_on_open?: boolean;
  is_read?: boolean;
  read_count?: number;
  total_count?: number;
  author_name?: string;
  sender_name?: string;
}
