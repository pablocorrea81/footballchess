-- Add turn_started_at column to games table to track when the current turn started
-- This is used for timeout detection (60 seconds per turn)

ALTER TABLE games
ADD COLUMN IF NOT EXISTS turn_started_at TIMESTAMPTZ;

-- Create index for efficient timeout queries
CREATE INDEX IF NOT EXISTS idx_games_turn_started_at 
ON games(turn_started_at) 
WHERE status = 'in_progress' AND turn_started_at IS NOT NULL;

-- Update existing in_progress games to set turn_started_at to now
-- This ensures existing games have a starting point for timeout detection
UPDATE games
SET turn_started_at = NOW()
WHERE status = 'in_progress' AND turn_started_at IS NULL;

