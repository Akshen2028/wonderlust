create table public.transportation_bookings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  provider text not null,
  transport_type text not null default 'train',
  departure_location text not null,
  arrival_location text not null,
  departure_at timestamptz not null,
  arrival_at timestamptz,
  seat_class text,
  booking_reference text,
  amount numeric(14,2) not null default 0,
  currency text not null default 'USD',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (arrival_at is null or arrival_at >= departure_at)
);

drop trigger if exists trg_transportation_bookings_updated on public.transportation_bookings;
create trigger trg_transportation_bookings_updated
before update on public.transportation_bookings
for each row execute procedure public.set_updated_at();

create index idx_transportation_bookings_trip on public.transportation_bookings(trip_id);

drop view if exists public.v_trip_totals;

create view public.v_trip_totals as
select
  t.id as trip_id,
  coalesce(f.flight_total, 0) as flight_total,
  coalesce(tb.transportation_total, 0) as transportation_total,
  coalesce(a.acc_total, 0) as accommodation_total,
  coalesce(e.exp_total, 0) as expense_total,
  coalesce(f.flight_total, 0)
    + coalesce(tb.transportation_total, 0)
    + coalesce(a.acc_total, 0)
    + coalesce(e.exp_total, 0) as grand_total
from public.trips t
left join (
  select trip_id, sum(amount) as flight_total
  from public.flights
  group by trip_id
) f on f.trip_id = t.id
left join (
  select trip_id, sum(amount) as transportation_total
  from public.transportation_bookings
  group by trip_id
) tb on tb.trip_id = t.id
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

  insert into public.transportation_bookings (
    trip_id, provider, transport_type, departure_location, arrival_location,
    departure_at, arrival_at, seat_class, booking_reference, amount, currency, notes
  )
  select
    v_new_trip, provider, transport_type, departure_location, arrival_location,
    departure_at, arrival_at, seat_class, booking_reference, amount, currency, notes
  from public.transportation_bookings
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

alter table public.transportation_bookings enable row level security;

drop policy if exists transportation_bookings_all on public.transportation_bookings;
create policy transportation_bookings_all on public.transportation_bookings for all using (true) with check (true);

grant all on public.transportation_bookings to anon, authenticated;
