-- Add invite_code column to games table
-- This column stores a unique code for inviting players to join games

ALTER TABLE games
ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;

-- Create index for fast lookup by invite_code
CREATE INDEX IF NOT EXISTS idx_games_invite_code ON games(invite_code);

-- Add comment to explain the column
COMMENT ON COLUMN games.invite_code IS 'Unique code for inviting players to join the game. Used in invite links.';

-- Generate invite codes for existing games (optional, for games without codes)
-- This is a one-time operation, you might want to skip this or run it manually
-- UPDATE games SET invite_code = LOWER(SUBSTRING(MD5(RANDOM()::TEXT || id::TEXT) FROM 1 FOR 6)) WHERE invite_code IS NULL;

