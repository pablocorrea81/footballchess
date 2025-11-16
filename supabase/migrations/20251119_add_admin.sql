-- Add is_admin column to profiles table
-- Admin users can reset statistics and perform administrative tasks

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Create index for admin lookups
CREATE INDEX IF NOT EXISTS profiles_is_admin_idx ON public.profiles (is_admin) WHERE is_admin = true;

-- Set pabloco@gmail.com as admin (if user exists)
UPDATE public.profiles
SET is_admin = true
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'pabloco@gmail.com'
);

COMMENT ON COLUMN public.profiles.is_admin IS 'Whether this user has admin privileges';

