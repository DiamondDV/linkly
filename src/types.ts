export interface User {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}

export interface Link {
  id: string;
  user_id: string | null;
  slug: string;
  long_url: string;
  clicks: number;
  created_at: string;
  short_url?: string;
}

export interface AuthResponse {
  user: User | null;
  error?: string;
}

export interface ShortenResponse {
  slug: string;
  shortUrl: string;
  error?: string;
  limitReached?: boolean;
}
