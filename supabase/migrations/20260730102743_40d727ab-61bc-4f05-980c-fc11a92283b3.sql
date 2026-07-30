alter table public.profiles add column if not exists phone text;

create unique index if not exists profiles_phone_unique on public.profiles (phone) where phone is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare user_count int;
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    nullif(new.raw_user_meta_data->>'phone','')
  );
  select count(*) into user_count from public.user_roles;
  insert into public.user_roles (user_id, role)
  values (new.id, case when user_count = 0 then 'admin'::public.app_role else 'staff'::public.app_role end);
  return new;
end; $function$;