-- 016 · Users administration + settings storage (M4 §7 / §8 · M2 §4.4)
-- Forward-only (invariant I7). Rollback = a new forward migration.

-- ---------------------------------------------------------------------------
-- role_rank — the rank ladder behind M4 §7's rules
-- ---------------------------------------------------------------------------
create or replace function public.role_rank(p_role public.app_role)
returns int
language sql
immutable
as $$
  select case p_role
    when 'user' then 0
    when 'author' then 10
    when 'reviewer' then 10
    when 'blog_editor' then 10
    when 'moderator' then 10
    when 'jobs_manager' then 10
    when 'support' then 10
    when 'content_manager' then 20
    when 'admin' then 80
    when 'super_admin' then 100
  end
$$;

-- ---------------------------------------------------------------------------
-- admin_search_users — the Users surface search (M4 §7), admin+ only
-- ---------------------------------------------------------------------------
-- Email lives in auth.users; staff may see it here (admin+, audited surface)
-- but never passwords — there is no password path anywhere (M4 §7).
create or replace function public.admin_search_users(p_query text)
returns table (
  id uuid,
  username text,
  display_name text,
  role public.app_role,
  email text,
  email_confirmed_at timestamptz,
  created_at timestamptz,
  deletion_requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_role(array['admin', 'super_admin']) then
    raise exception 'admin_search_users: admin role required' using errcode = '42501';
  end if;

  return query
    select p.id, p.username::text, p.display_name, p.role,
           u.email::text, u.email_confirmed_at, p.created_at, p.deletion_requested_at
      from public.profiles p
      join auth.users u on u.id = p.id
     where p_query is null
        or p_query = ''
        or p.username ilike '%' || p_query || '%'
        or p.display_name ilike '%' || p_query || '%'
        or u.email ilike '%' || p_query || '%'
     order by p.created_at desc
     limit 30;
end;
$$;

comment on function public.admin_search_users(text) is
  'Users-admin search (M4 §7): username/display/email match, admin+ only. Emails visible, passwords nonexistent by construction.';

-- ---------------------------------------------------------------------------
-- admin_set_role — rank rules enforced in one place (M4 §7, CI-probed)
-- ---------------------------------------------------------------------------
--   · admin+ assigns roles at all
--   · the ACTOR outranks the target user's CURRENT role (peers untouchable)
--   · the GRANTED role ranks below the actor — except super_admin, who may
--     grant anything including super_admin (typed confirmation is UI-side)
create or replace function public.admin_set_role(
  p_target uuid,
  p_new_role public.app_role
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role public.app_role;
  v_target_role public.app_role;
begin
  select p.role into v_actor_role from public.profiles p where p.id = v_actor;
  if v_actor_role is null or public.role_rank(v_actor_role) < 80 then
    raise exception 'admin_set_role: admin role required' using errcode = '42501';
  end if;

  select p.role into v_target_role from public.profiles p where p.id = p_target;
  if v_target_role is null then
    raise exception 'admin_set_role: target % not found', p_target;
  end if;

  if p_target = v_actor then
    raise exception 'admin_set_role: cannot change your own role' using errcode = '42501';
  end if;
  if public.role_rank(v_target_role) >= public.role_rank(v_actor_role) then
    raise exception 'admin_set_role: target outranks or equals you' using errcode = '42501';
  end if;
  if v_actor_role <> 'super_admin'
     and public.role_rank(p_new_role) >= public.role_rank(v_actor_role) then
    raise exception 'admin_set_role: cannot grant a rank at or above your own'
      using errcode = '42501';
  end if;

  update public.profiles set role = p_new_role where id = p_target;
end;
$$;

comment on function public.admin_set_role(uuid, public.app_role) is
  'Role assignment with the M4 §7 rank rules inside: admin+ only, never peers/above, never a rank ≥ your own (super_admin exempt). Audited app-side via withAudit.';

-- ---------------------------------------------------------------------------
-- admin_force_rename — the M2 §4.4 surface (quarantine applied atomically)
-- ---------------------------------------------------------------------------
create or replace function public.admin_force_rename(
  p_target uuid,
  p_new_username text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  if not public.has_role(array['admin', 'super_admin']) then
    raise exception 'admin_force_rename: admin role required' using errcode = '42501';
  end if;

  if p_new_username is null
     or p_new_username !~ '^[a-z0-9][a-z0-9_-]{1,18}[a-z0-9]$' then
    raise exception 'admin_force_rename: invalid username %', p_new_username;
  end if;
  if exists (select 1 from public.reserved_usernames r where r.handle = p_new_username) then
    raise exception 'admin_force_rename: % is reserved', p_new_username;
  end if;
  if exists (
    select 1 from public.handle_quarantine q
     where q.handle = p_new_username and q.freed_after > now()
  ) then
    raise exception 'admin_force_rename: % is quarantined', p_new_username;
  end if;

  select p.username::text into v_old from public.profiles p where p.id = p_target;
  if v_old is null then
    raise exception 'admin_force_rename: target % not found', p_target;
  end if;
  if v_old = p_new_username then
    return v_old;
  end if;

  -- 90-day hold on the vacated handle (M2 §4.4).
  insert into public.handle_quarantine (handle, freed_after)
  values (v_old, now() + interval '90 days');

  update public.profiles set username = p_new_username where id = p_target;

  return v_old;
end;
$$;

comment on function public.admin_force_rename(uuid, text) is
  'Force-rename per the M2 §4.4 contract: format/reserved/quarantine checks, 90-day quarantine on the old handle, atomic. Admin+; reason + notification handled app-side.';

-- ---------------------------------------------------------------------------
-- site_settings — the §8 site-metadata store
-- ---------------------------------------------------------------------------
create table public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;

-- Public read (titles/social images feed public pages); admin write.
create policy site_settings_public_read on public.site_settings
  for select to anon, authenticated
  using (true);

create policy site_settings_admin_write on public.site_settings
  for all to authenticated
  using (public.has_role(array['admin', 'super_admin']))
  with check (public.has_role(array['admin', 'super_admin']));

insert into public.site_settings (key, value) values
  ('site.title', '"ePharmatica"'::jsonb),
  ('site.description', '"Study material that''s easier than the textbook."'::jsonb),
  ('site.social_image', 'null'::jsonb),
  ('site.contacts', '{"support": "support@epharmatica.com", "legal": "legal@epharmatica.com", "privacy": "privacy@epharmatica.com", "jobs": "jobs@epharmatica.com"}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- reserved_usernames — the §8 list editor needs admin writes
-- ---------------------------------------------------------------------------
create policy reserved_usernames_admin_write on public.reserved_usernames
  for all to authenticated
  using (public.has_role(array['admin', 'super_admin']))
  with check (public.has_role(array['admin', 'super_admin']));
