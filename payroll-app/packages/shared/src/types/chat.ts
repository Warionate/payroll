// --- Chat ---

export interface ChatRoom {
  id: number;
  name: string | null;
  type: 'dm' | 'group';
  created_by: number;
  created_at: string;
  last_message?: string;
  last_message_at?: string;
  unread_count: number;
  members: ChatMember[];
  expires_at?: string;
}

export interface ChatMember {
  id: number;
  username: string;
  role: 'admin' | 'user';
  last_read_at: string | null;
}

export interface ChatMessage {
  id: number;
  room_id: number;
  sender_id: number;
  message: string;
  sender_name: string;
  sender_role?: 'admin' | 'user';
  created_at: string;
  attachment_url?: string;
  attachment_name?: string;
  attachment_type?: string;
}
