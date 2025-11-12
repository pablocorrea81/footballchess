-- Add winning_score and timeout_enabled columns to games table
ALTER TABLE public.games
ADD COLUMN winning_score integer DEFAULT 3 CHECK (winning_score IN (1, 2, 3)),
ADD COLUMN timeout_enabled boolean DEFAULT true;

-- Add an index for winning_score if needed (optional)
CREATE INDEX IF NOT EXISTS games_winning_score_idx ON public.games (winning_score);

-- Update existing games to have default values
UPDATE public.games
SET winning_score = 3, timeout_enabled = true
WHERE winning_score IS NULL OR timeout_enabled IS NULL;

