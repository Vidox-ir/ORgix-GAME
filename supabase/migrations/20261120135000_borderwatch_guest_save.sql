create schema if not exists private;

create table if not exists public.borderwatch_players (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (char_length(nickname) between 2 and 18),
  save_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(save_data) = 'object' and pg_column_size(save_data) <= 65536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.borderwatch_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.borderwatch_players(id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists borderwatch_sessions_player_idx on public.borderwatch_sessions(player_id);
create index if not exists borderwatch_sessions_expiry_idx on public.borderwatch_sessions(expires_at);

create table if not exists private.borderwatch_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  hits integer not null check (hits >= 0)
);

alter table public.borderwatch_players enable row level security;
alter table public.borderwatch_sessions enable row level security;
alter table private.borderwatch_rate_limits enable row level security;

revoke all on table public.borderwatch_players from anon, authenticated;
revoke all on table public.borderwatch_sessions from anon, authenticated;
grant select, insert, update, delete on table public.borderwatch_players to service_role;
grant select, insert, update, delete on table public.borderwatch_sessions to service_role;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;
revoke all on table private.borderwatch_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table private.borderwatch_rate_limits to service_role;

create or replace function public.borderwatch_rate_limit(
  p_key text, p_max_hits integer, p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_hits integer;
begin
  if p_key is null or char_length(p_key)<16 or char_length(p_key)>128
     or p_max_hits<1 or p_max_hits>120 or p_window_seconds<1 or p_window_seconds>86400 then
    return false;
  end if;
  insert into private.borderwatch_rate_limits as current_limit(bucket_key,window_started_at,hits)
  values(p_key,pg_catalog.now(),1)
  on conflict(bucket_key) do update
  set window_started_at=case
        when current_limit.window_started_at<=pg_catalog.now()-pg_catalog.make_interval(secs=>p_window_seconds)
        then pg_catalog.now() else current_limit.window_started_at end,
      hits=case
        when current_limit.window_started_at<=pg_catalog.now()-pg_catalog.make_interval(secs=>p_window_seconds)
        then 1 else current_limit.hits+1 end
  returning hits into v_hits;
  return v_hits<=p_max_hits;
end;
$function$;

revoke all on function public.borderwatch_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.borderwatch_rate_limit(text,integer,integer) to service_role;
