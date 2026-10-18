export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  HUEVO_CLIENT_ID: string;
  HUEVO_CLIENT_SECRET: string;
  JWT_SECRET?: string;
  ADMIN_IDS: string;
  COMMISSION_PCT: string;
  DEV_LOGIN: string;
}

export interface UserRow {
  id: number;
  username: string;
  display_name: string;
  avatar: string;
  banned: number;
}

export type Vars = { user: UserRow; mode: 'live' | 'test' };
