insert into storage.buckets (id, name, public)
values ('notification-images', 'notification-images', true)
on conflict (id) do update set public = true;

create policy "Public read notification images"
on storage.objects for select
to public
using (bucket_id = 'notification-images');
