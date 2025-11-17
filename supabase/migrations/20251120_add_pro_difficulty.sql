-- Add 'pro' to bot_difficulty constraint
-- This allows the new 'pro' difficulty level for AI games

-- First, drop the existing constraint
ALTER TABLE public.games 
DROP CONSTRAINT IF EXISTS games_bot_difficulty_check;

-- Add new constraint that includes 'pro'
ALTER TABLE public.games 
ADD CONSTRAINT games_bot_difficulty_check 
CHECK (bot_difficulty IS NULL OR bot_difficulty IN ('easy', 'medium', 'hard', 'pro'));

