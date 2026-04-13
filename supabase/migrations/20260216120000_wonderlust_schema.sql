-- Wonderlust: public schema, RLS, view, duplicate_trip RPC
-- Applied via: supabase db push (linked remote) or supabase db reset (local)

create extension if not exists "pgcrypto";

do $$ begin
  create type expense_category as enum (
    'food', 'transport', 'attractions', 'shopping', 'visas', 'insurance', 'misc'
  );
exception
  when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  destination_city text not null,
  destination_country text not null,
  destinations jsonb not null default '[]'::jsonb,
  start_date date not null,
  end_date date not null,
  traveler_count int not null default 1 check (traveler_count >= 1),
  cover_image_path text,
  notes text,
  budget_amount numeric(14,2),
  budget_currency text not null default 'USD',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

drop trigger if exists trg_trips_updated on public.trips;
create trigger trg_trips_updated
before update on public.trips
for each row execute procedure public.set_updated_at();

create table public.link_previews (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  canonical_url text,
  title text,
  description text,
  image_url text,
  site_name text,
  fetched_at timestamptz not null default now(),
  raw_metadata jsonb not null default '{}'::jsonb
);

create table public.trip_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  day_date date not null,
  day_number int not null,
  title text,
  summary text,
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, day_number),
  unique (trip_id, day_date)
);

drop trigger if exists trg_trip_days_updated on public.trip_days;
create trigger trg_trip_days_updated
before update on public.trip_days
for each row execute procedure public.set_updated_at();

create index idx_trip_days_trip on public.trip_days(trip_id);

create table public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  trip_day_id uuid not null references public.trip_days(id) on delete cascade,
  start_time time,
  end_time time,
  title text not null,
  details text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_time_blocks_updated on public.time_blocks;
create trigger trg_time_blocks_updated
before update on public.time_blocks
for each row execute procedure public.set_updated_at();

create index idx_time_blocks_day on public.time_blocks(trip_day_id);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  trip_day_id uuid not null references public.trip_days(id) on delete cascade,
  title text not null,
  details text,
  url text,
  link_preview_id uuid references public.link_previews(id) on delete set null,
  preview_title text,
  preview_image_url text,
  preview_description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_activities_updated on public.activities;
create trigger trg_activities_updated
before update on public.activities
for each row execute procedure public.set_updated_at();

create index idx_activities_day on public.activities(trip_day_id);

create table public.flights (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  airline text not null,
  flight_number text,
  departure_airport text not null,
  arrival_airport text not null,
  departure_at timestamptz not null,
  arrival_at timestamptz not null,
  seat_class text,
  booking_reference text,
  amount numeric(14,2) not null default 0,
  currency text not null default 'USD',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_flights_updated on public.flights;
create trigger trg_flights_updated
before update on public.flights
for each row execute procedure public.set_updated_at();

create index idx_flights_trip on public.flights(trip_id);

create table public.accommodations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null,
  accommodation_type text not null default 'hotel',
  address text,
  check_in timestamptz not null,
  check_out timestamptz not null,
  confirmation_number text,
  room_type text,
  booking_url text,
  link_preview_id uuid references public.link_previews(id) on delete set null,
  preview_title text,
  preview_image_url text,
  preview_description text,
  amount numeric(14,2) not null default 0,
  currency text not null default 'USD',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out >= check_in)
);

drop trigger if exists trg_accommodations_updated on public.accommodations;
create trigger trg_accommodations_updated
before update on public.accommodations
for each row execute procedure public.set_updated_at();

create index idx_accommodations_trip on public.accommodations(trip_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null,
  category expense_category not null default 'misc',
  amount numeric(14,2) not null,
  currency text not null default 'USD',
  expense_date date not null,
  paid_by text,
  split_count int not null default 1 check (split_count >= 1),
  is_shared boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_expenses_updated on public.expenses;
create trigger trg_expenses_updated
before update on public.expenses
for each row execute procedure public.set_updated_at();

create index idx_expenses_trip on public.expenses(trip_id);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  trip_day_id uuid references public.trip_days(id) on delete cascade,
  storage_path text not null,
  caption text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_photos_trip on public.photos(trip_id);
create index idx_photos_day on public.photos(trip_day_id);

create or replace view public.v_trip_totals as
select
  t.id as trip_id,
  coalesce(f.flight_total, 0) as flight_total,
  coalesce(a.acc_total, 0) as accommodation_total,
  coalesce(e.exp_total, 0) as expense_total,
  coalesce(f.flight_total, 0) + coalesce(a.acc_total, 0) + coalesce(e.exp_total, 0) as grand_total
from public.trips t
left join (
  select trip_id, sum(amount) as flight_total
  from public.flights
  group by trip_id
) f on f.trip_id = t.id
left join (
  select trip_id, sum(amount) as acc_total
  from public.accommodations
  group by trip_id
) a on a.trip_id = t.id
left join (
  select trip_id, sum(amount) as exp_total
  from public.expenses
  group by trip_id
) e on e.trip_id = t.id;

create or replace function public.duplicate_trip(p_source_trip_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_new_trip uuid;
  r_day record;
  v_new_day uuid;
begin
  insert into public.trips (
    name, destination_city, destination_country, destinations,
    start_date, end_date, traveler_count,
    cover_image_path, notes, budget_amount, budget_currency, archived_at
  )
  select
    name || ' (copy)',
    destination_city,
    destination_country,
    destinations,
    start_date,
    end_date,
    traveler_count,
    null,
    notes,
    budget_amount,
    budget_currency,
    null
  from public.trips
  where id = p_source_trip_id
  returning id into v_new_trip;

  if v_new_trip is null then
    raise exception 'Trip not found';
  end if;

  for r_day in
    select * from public.trip_days
    where trip_id = p_source_trip_id
    order by day_number asc
  loop
    insert into public.trip_days (
      trip_id, day_date, day_number, title, summary, location, notes
    ) values (
      v_new_trip,
      r_day.day_date,
      r_day.day_number,
      r_day.title,
      r_day.summary,
      r_day.location,
      r_day.notes
    )
    returning id into v_new_day;

    insert into public.time_blocks (trip_day_id, start_time, end_time, title, details, sort_order)
    select v_new_day, start_time, end_time, title, details, sort_order
    from public.time_blocks
    where trip_day_id = r_day.id;

    insert into public.activities (
      trip_day_id, title, details, url, link_preview_id,
      preview_title, preview_image_url, preview_description, sort_order
    )
    select
      v_new_day, title, details, url, link_preview_id,
      preview_title, preview_image_url, preview_description, sort_order
    from public.activities
    where trip_day_id = r_day.id;
  end loop;

  insert into public.flights (
    trip_id, airline, flight_number, departure_airport, arrival_airport,
    departure_at, arrival_at, seat_class, booking_reference, amount, currency, notes
  )
  select
    v_new_trip, airline, flight_number, departure_airport, arrival_airport,
    departure_at, arrival_at, seat_class, booking_reference, amount, currency, notes
  from public.flights
  where trip_id = p_source_trip_id;

  insert into public.accommodations (
    trip_id, name, accommodation_type, address, check_in, check_out,
    confirmation_number, room_type, booking_url, link_preview_id,
    preview_title, preview_image_url, preview_description, amount, currency, notes
  )
  select
    v_new_trip, name, accommodation_type, address, check_in, check_out,
    confirmation_number, room_type, booking_url, link_preview_id,
    preview_title, preview_image_url, preview_description, amount, currency, notes
  from public.accommodations
  where trip_id = p_source_trip_id;

  insert into public.expenses (
    trip_id, title, category, amount, currency, expense_date,
    paid_by, split_count, is_shared, notes
  )
  select
    v_new_trip, title, category, amount, currency, expense_date,
    paid_by, split_count, is_shared, notes
  from public.expenses
  where trip_id = p_source_trip_id;

  return v_new_trip;
end;
$$;

alter table public.trips enable row level security;
alter table public.trip_days enable row level security;
alter table public.time_blocks enable row level security;
alter table public.activities enable row level security;
alter table public.flights enable row level security;
alter table public.accommodations enable row level security;
alter table public.expenses enable row level security;
alter table public.photos enable row level security;
alter table public.link_previews enable row level security;

drop policy if exists trips_all on public.trips;
create policy trips_all on public.trips for all using (true) with check (true);
drop policy if exists trip_days_all on public.trip_days;
create policy trip_days_all on public.trip_days for all using (true) with check (true);
drop policy if exists time_blocks_all on public.time_blocks;
create policy time_blocks_all on public.time_blocks for all using (true) with check (true);
drop policy if exists activities_all on public.activities;
create policy activities_all on public.activities for all using (true) with check (true);
drop policy if exists flights_all on public.flights;
create policy flights_all on public.flights for all using (true) with check (true);
drop policy if exists accommodations_all on public.accommodations;
create policy accommodations_all on public.accommodations for all using (true) with check (true);
drop policy if exists expenses_all on public.expenses;
create policy expenses_all on public.expenses for all using (true) with check (true);
drop policy if exists photos_all on public.photos;
create policy photos_all on public.photos for all using (true) with check (true);
drop policy if exists link_previews_all on public.link_previews;
create policy link_previews_all on public.link_previews for all using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant execute on function public.duplicate_trip(uuid) to anon, authenticated;
grant select on public.v_trip_totals to anon, authenticated;
