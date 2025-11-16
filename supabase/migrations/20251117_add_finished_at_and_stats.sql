-- Add finished_at column to track when games ended
ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS finished_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for efficient statistics queries

-- Index for finished games by winner
CREATE INDEX IF NOT EXISTS games_winner_finished_idx 
ON public.games (winner_id, finished_at) 
WHERE status = 'finished' AND winner_id IS NOT NULL;

-- Index for finished games by player_1_id
CREATE INDEX IF NOT EXISTS games_player_1_finished_idx 
ON public.games (player_1_id, finished_at) 
WHERE status = 'finished';

-- Index for finished games by player_2_id (for multiplayer games)
CREATE INDEX IF NOT EXISTS games_player_2_finished_idx 
ON public.games (player_2_id, finished_at) 
WHERE status = 'finished' AND player_2_id IS NOT NULL;

-- Index for bot games by difficulty (for bot difficulty stats)
CREATE INDEX IF NOT EXISTS games_bot_difficulty_finished_idx 
ON public.games (bot_difficulty, finished_at) 
WHERE is_bot_game = true AND status = 'finished' AND bot_difficulty IS NOT NULL;

-- Index for finished_at for time-based queries
CREATE INDEX IF NOT EXISTS games_finished_at_idx 
ON public.games (finished_at) 
WHERE status = 'finished' AND finished_at IS NOT NULL;

-- Index for multiplayer games (both players) for head-to-head stats
CREATE INDEX IF NOT EXISTS games_multiplayer_finished_idx 
ON public.games (player_1_id, player_2_id, finished_at) 
WHERE is_bot_game = false AND status = 'finished' AND player_2_id IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN public.games.finished_at IS 'Timestamp when the game ended (when status changed to finished)';
