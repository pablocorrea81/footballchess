-- Create trophies table
CREATE TABLE IF NOT EXISTS public.trophies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL, -- Emoji or icon identifier
  category TEXT NOT NULL, -- 'victory', 'milestone', 'special', 'streak'
  rarity TEXT NOT NULL DEFAULT 'common', -- 'common', 'rare', 'epic', 'legendary'
  condition_type TEXT NOT NULL, -- 'first_win', 'win_count', 'win_streak', 'special'
  condition_value JSONB, -- Flexible condition data
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create player_trophies junction table
CREATE TABLE IF NOT EXISTS public.player_trophies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  trophy_id TEXT NOT NULL REFERENCES public.trophies(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  game_id UUID REFERENCES public.games(id) ON DELETE SET NULL, -- Game that unlocked this trophy
  UNIQUE(player_id, trophy_id) -- Prevent duplicate trophies
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS player_trophies_player_id_idx ON public.player_trophies(player_id);
CREATE INDEX IF NOT EXISTS player_trophies_trophy_id_idx ON public.player_trophies(trophy_id);
CREATE INDEX IF NOT EXISTS player_trophies_unlocked_at_idx ON public.player_trophies(unlocked_at DESC);

-- Insert initial trophies
INSERT INTO public.trophies (id, name, description, icon, category, rarity, condition_type, condition_value) VALUES
-- Victory Trophies
('first_win', 'Primera Victoria', 'Gana tu primera partida', '🏆', 'victory', 'common', 'first_win', '{"type": "any"}'),
('first_win_vs_bot', 'Victoria contra IA', 'Gana tu primera partida contra la IA', '🤖', 'victory', 'common', 'first_win', '{"type": "bot"}'),
('first_win_vs_player', 'Primera Victoria Multijugador', 'Gana tu primera partida contra otro jugador', '👥', 'victory', 'common', 'first_win', '{"type": "multiplayer"}'),
('first_win_easy', 'Victoria Fácil', 'Gana tu primera partida contra IA Fácil', '🟢', 'victory', 'common', 'first_win', '{"type": "bot", "difficulty": "easy"}'),
('first_win_medium', 'Victoria Media', 'Gana tu primera partida contra IA Media', '🟡', 'victory', 'common', 'first_win', '{"type": "bot", "difficulty": "medium"}'),
('first_win_hard', 'Maestro del Juego', 'Gana tu primera partida contra IA Difícil', '🔴', 'victory', 'rare', 'first_win', '{"type": "bot", "difficulty": "hard"}'),
('first_win_pro', 'Leyenda del Tablero', 'Gana tu primera partida contra IA Pro', '⭐', 'victory', 'epic', 'first_win', '{"type": "bot", "difficulty": "pro"}'),

-- Milestone Trophies
('win_5', 'En Racha', 'Gana 5 partidas', '🔥', 'milestone', 'common', 'win_count', '{"count": 5}'),
('win_10', 'Veterano', 'Gana 10 partidas', '💪', 'milestone', 'common', 'win_count', '{"count": 10}'),
('win_25', 'Experto', 'Gana 25 partidas', '🎯', 'milestone', 'rare', 'win_count', '{"count": 25}'),
('win_50', 'Maestro', 'Gana 50 partidas', '👑', 'milestone', 'rare', 'win_count', '{"count": 50}'),
('win_100', 'Leyenda', 'Gana 100 partidas', '🌟', 'milestone', 'epic', 'win_count', '{"count": 100}'),

-- Multiplayer Milestones
('multiplayer_win_5', 'Rey del Multijugador', 'Gana 5 partidas multijugador', '👥', 'milestone', 'common', 'win_count', '{"count": 5, "type": "multiplayer"}'),
('multiplayer_win_10', 'Campeón Social', 'Gana 10 partidas multijugador', '🏅', 'milestone', 'rare', 'win_count', '{"count": 10, "type": "multiplayer"}'),

-- Bot Victory Milestones
('bot_win_10', 'Cazador de Bots', 'Gana 10 partidas contra IA', '🤖', 'milestone', 'common', 'win_count', '{"count": 10, "type": "bot"}'),
('bot_win_25', 'Destructor de IA', 'Gana 25 partidas contra IA', '⚔️', 'milestone', 'rare', 'win_count', '{"count": 25, "type": "bot"}'),
('hard_bot_win_5', 'Domador de Difícil', 'Gana 5 partidas contra IA Difícil', '🔴', 'milestone', 'rare', 'win_count', '{"count": 5, "type": "bot", "difficulty": "hard"}'),
('pro_bot_win_3', 'Maestro de Pro', 'Gana 3 partidas contra IA Pro', '⭐', 'milestone', 'epic', 'win_count', '{"count": 3, "type": "bot", "difficulty": "pro"}'),

-- Streak Trophies
('win_streak_3', 'Racha de 3', 'Gana 3 partidas seguidas', '🔥', 'streak', 'common', 'win_streak', '{"streak": 3}'),
('win_streak_5', 'Racha de 5', 'Gana 5 partidas seguidas', '🔥🔥', 'streak', 'rare', 'win_streak', '{"streak": 5}'),
('win_streak_10', 'Racha Imparable', 'Gana 10 partidas seguidas', '🔥🔥🔥', 'streak', 'epic', 'win_streak', '{"streak": 10}'),

-- Special Trophies
('perfect_game', 'Partida Perfecta', 'Gana una partida sin recibir goles', '✨', 'special', 'rare', 'special', '{"type": "perfect_game"}'),
('comeback_king', 'Rey del Remonte', 'Gana una partida después de estar perdiendo por 2 goles', '💪', 'special', 'epic', 'special', '{"type": "comeback", "deficit": 2}'),
('first_goal', 'Primer Gol', 'Marca tu primer gol', '⚽', 'special', 'common', 'special', '{"type": "first_goal"}'),
('hat_trick', 'Hat-Trick', 'Marca 3 goles en una sola partida', '🎩', 'special', 'rare', 'special', '{"type": "hat_trick"}'),
('clean_sheet', 'Portería a Cero', 'Gana una partida sin recibir goles', '🛡️', 'special', 'rare', 'special', '{"type": "clean_sheet"}'),

-- Piece-specific goal trophies
('goal_with_defensa', 'Gol Defensivo', 'Marca un gol con un defensa', '🛡️⚽', 'special', 'rare', 'special', '{"type": "goal_with_piece", "piece_type": "defensa"}'),
('goal_with_mediocampista', 'Gol del Mediocampo', 'Marca un gol con un mediocampista', '⚙️⚽', 'special', 'common', 'special', '{"type": "goal_with_piece", "piece_type": "mediocampista"}'),
('goal_with_carrilero', 'Gol del Carril', 'Marca un gol con un carrilero', '👤⚽', 'special', 'common', 'special', '{"type": "goal_with_piece", "piece_type": "carrilero"}'),
('goal_with_delantero', 'Gol del Delantero', 'Marca un gol con un delantero', '⚡⚽', 'special', 'common', 'special', '{"type": "goal_with_piece", "piece_type": "delantero"}')
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.trophies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_trophies ENABLE ROW LEVEL SECURITY;

-- RLS Policies for trophies (read-only for everyone)
CREATE POLICY "Trophies are viewable by everyone" ON public.trophies
  FOR SELECT USING (true);

-- RLS Policies for player_trophies (users can only see their own trophies)
CREATE POLICY "Users can view their own trophies" ON public.player_trophies
  FOR SELECT USING (auth.uid() = player_id);

-- Allow service role to insert (for trophy unlocking)
CREATE POLICY "Service role can insert player trophies" ON public.player_trophies
  FOR INSERT WITH CHECK (true);

