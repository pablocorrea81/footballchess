-- Add show_move_hints column to profiles table
-- This column controls whether to show move hints when hovering over pieces

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS show_move_hints BOOLEAN NOT NULL DEFAULT true;

-- Add comment to explain the column
COMMENT ON COLUMN profiles.show_move_hints IS 'Whether to show move hints when hovering over pieces for 5 seconds';

