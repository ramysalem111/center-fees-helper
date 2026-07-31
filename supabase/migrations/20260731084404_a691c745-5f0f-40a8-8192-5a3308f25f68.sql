create table public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  section text not null,
  created_at timestamptz not null default now(),
  unique (user_id, section)
);
grant select, insert, update, delete on public.user_permissions to authenticated;
grant all on public.user_permissions to service_role;
alter table public.user_permissions enable row level security;
create policy "read own or admin" on public.user_permissions for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "admin insert" on public.user_permissions for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "admin update" on public.user_permissions for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin delete" on public.user_permissions for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create table public.income_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status public.entity_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.income_types to authenticated;
grant all on public.income_types to service_role;
alter table public.income_types enable row level security;
create policy "read for authenticated" on public.income_types for select to authenticated using (true);
create policy "insert for authenticated" on public.income_types for insert to authenticated with check (true);
create policy "update for authenticated" on public.income_types for update to authenticated using (true) with check (true);
create policy "delete for admin" on public.income_types for delete to authenticated using (public.has_role(auth.uid(),'admin'));
insert into public.income_types (name) values ('كتب'),('ملازم'),('اشتراكات'),('أخرى');

create table public.other_incomes (
  id uuid primary key default gen_random_uuid(),
  income_date date not null default current_date,
  income_type_id uuid references public.income_types(id),
  amount numeric not null default 0,
  payment_method_id uuid references public.payment_methods(id),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.other_incomes to authenticated;
grant all on public.other_incomes to service_role;
alter table public.other_incomes enable row level security;
create policy "read for authenticated" on public.other_incomes for select to authenticated using (true);
create policy "insert for authenticated" on public.other_incomes for insert to authenticated with check (true);
create policy "update for authenticated" on public.other_incomes for update to authenticated using (true) with check (true);
create policy "delete for admin" on public.other_incomes for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create trigger update_income_types_updated_at before update on public.income_types for each row execute function public.update_updated_at_column();
create trigger update_other_incomes_updated_at before update on public.other_incomes for each row execute function public.update_updated_at_column();