-- Wonderlust: Storage buckets + policies (trip-covers, trip-day-photos)

insert into storage.buckets (id, name, public)
values ('trip-covers', 'trip-covers', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('trip-day-photos', 'trip-day-photos', false)
on conflict (id) do nothing;

drop policy if exists "trip_covers_all" on storage.objects;
create policy "trip_covers_all"
on storage.objects for all
using (bucket_id = 'trip-covers')
with check (bucket_id = 'trip-covers');

drop policy if exists "trip_day_photos_all" on storage.objects;
create policy "trip_day_photos_all"
on storage.objects for all
using (bucket_id = 'trip-day-photos')
with check (bucket_id = 'trip-day-photos');
