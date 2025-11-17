-- Add bot_style column to games table
-- This allows AI to have different playing styles (defensive, offensive, moderate, tactical, counterattack, control)
-- Each game vs AI will randomly select a style to make gameplay more varied

ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS bot_style text CHECK (bot_style IN ('defensive', 'offensive', 'moderate', 'tactical', 'counterattack', 'control'));

COMMENT ON COLUMN public.games.bot_style IS 'Playing style for the AI opponent. Randomly selected when creating a bot game.';

