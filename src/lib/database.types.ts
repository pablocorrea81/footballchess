export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          elo_rating: number | null;
          created_at: string | null;
        };
        Insert: {
          id: string;
          username: string;
          elo_rating?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          username?: string;
          elo_rating?: number | null;
          created_at?: string | null;
        };
      };
      games: {
        Row: {
          id: string;
          created_at: string | null;
          status: string;
          player_1_id: string;
          player_2_id: string | null;
          game_state: Json;
          score: Json;
          winner_id: string | null;
          is_bot_game: boolean;
          bot_player: string | null;
          bot_difficulty: string | null;
          bot_display_name: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string | null;
          status?: string;
          player_1_id: string;
          player_2_id?: string | null;
          game_state?: Json;
          score?: Json;
          winner_id?: string | null;
          is_bot_game?: boolean;
          bot_player?: string | null;
          bot_difficulty?: string | null;
          bot_display_name?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string | null;
          status?: string;
          player_1_id?: string;
          player_2_id?: string | null;
          game_state?: Json;
          score?: Json;
          winner_id?: string | null;
          is_bot_game?: boolean;
          bot_player?: string | null;
          bot_difficulty?: string | null;
          bot_display_name?: string | null;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

