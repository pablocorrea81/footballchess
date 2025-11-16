-- Teams (clubes) table to allow each user to customize their team

CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  primary_color text NOT NULL DEFAULT '#16a34a',   -- Emerald 600
  secondary_color text NOT NULL DEFAULT '#0f766e', -- Teal 700
  emblem_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure one team per owner (for ahora)
CREATE UNIQUE INDEX IF NOT EXISTS teams_owner_unique_idx ON public.teams (owner_id);

-- Link teams to games (equipo de cada jugador en la partida)
ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS team_1_id uuid REFERENCES public.teams (id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS team_2_id uuid REFERENCES public.teams (id) ON DELETE SET NULL;

-- Enable RLS and basic policies for teams
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teams are readable by owner"
ON public.teams
FOR SELECT
USING (auth.uid() = owner_id);

CREATE POLICY "Teams are insertable by owner"
ON public.teams
FOR INSERT
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Teams are updatable by owner"
ON public.teams
FOR UPDATE
USING (auth.uid() = owner_id);

CREATE POLICY "Teams are deletable by owner"
ON public.teams
FOR DELETE
USING (auth.uid() = owner_id);


