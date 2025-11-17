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
          avatar_url: string | null;
          show_move_hints: boolean | null;
          is_admin: boolean;
          created_at: string | null;
        };
        Insert: {
          id: string;
          username: string;
          elo_rating?: number | null;
          avatar_url?: string | null;
          show_move_hints?: boolean | null;
          is_admin?: boolean;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          username?: string;
          elo_rating?: number | null;
          avatar_url?: string | null;
          show_move_hints?: boolean | null;
          is_admin?: boolean;
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
          bot_style: string | null;
          bot_display_name: string | null;
          invite_code: string | null;
          turn_started_at: string | null;
          winning_score: number | null;
          timeout_enabled: boolean | null;
          finished_at: string | null;
          team_1_id: string | null;
          team_2_id: string | null;
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
          invite_code?: string | null;
          turn_started_at?: string | null;
          winning_score?: number | null;
          timeout_enabled?: boolean | null;
          finished_at?: string | null;
          team_1_id?: string | null;
          team_2_id?: string | null;
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
          bot_style?: string | null;
          bot_display_name?: string | null;
          invite_code?: string | null;
          turn_started_at?: string | null;
          winning_score?: number | null;
          timeout_enabled?: boolean | null;
          finished_at?: string | null;
          team_1_id?: string | null;
          team_2_id?: string | null;
        };
      };
      teams: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          primary_color: string;
          secondary_color: string;
          emblem_url: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          primary_color?: string;
          secondary_color?: string;
          emblem_url?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          primary_color?: string;
          secondary_color?: string;
          emblem_url?: string | null;
          created_at?: string | null;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

