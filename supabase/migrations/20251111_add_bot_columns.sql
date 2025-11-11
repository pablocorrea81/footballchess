-- Adds AI-related columns to games table for single-player mode
alter table public.games
  add column if not exists is_bot_game boolean not null default false,
  add column if not exists bot_player text check (bot_player in ('home', 'away')),
  add column if not exists bot_difficulty text check (bot_difficulty in ('easy', 'medium', 'hard')) default 'easy',
  add column if not exists bot_display_name text default 'FootballBot';

comment on column public.games.is_bot_game is 'Indicates whether this match is against a built-in AI opponent.';
comment on column public.games.bot_player is 'Defines which side is controlled by the AI (home/away).';
comment on column public.games.bot_difficulty is 'Difficulty hint for the Football Chess AI.';
comment on column public.games.bot_display_name is 'Display label for the AI opponent.';

