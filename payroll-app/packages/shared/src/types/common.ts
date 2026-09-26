// --- Common Types ---

export interface CalendarToken {
  token: string;
  created_at: string;
  google_url: string;
  apple_url: string;
  ical_url: string;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface ApiResponse<T = unknown> {
  data: T;
  message?: string;
}

export interface ApiError {
  error: string;
  code?: number;
  details?: string;
}
