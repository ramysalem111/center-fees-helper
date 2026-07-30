-- =========================
-- ENUMS
-- =========================
create type public.app_role as enum ('admin','staff');
create type public.entity_status as enum ('active','inactive');
create type public.student_status as enum ('active','suspended','withdrawn');
create type public.group_status as enum ('open','listed','finished','archived');
create type public.billing_system as enum ('monthly','per_8_sessions');
create type public.billing_type as enum ('prepaid','postpaid');
create type public.attendance_status as enum ('present','absent','makeup');
create type public.due_status as enum ('unpaid','partial','paid');

-- =========================
-- COMMON TRIGGER
-- =========================
create or replace function public.update_updated_at_column()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- =========================
-- PROFILES + ROLES
-- =========================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles readable by authenticated" on public.profiles for select to authenticated using (true);
create policy "own profile insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create trigger trg_profiles_updated before update on public.profiles for each row execute function public.update_updated_at_column();

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'staff',
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create policy "roles readable by authenticated" on public.user_roles for select to authenticated using (true);

-- first user becomes admin, everyone gets a profile
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare user_count int;
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''));
  select count(*) into user_count from public.user_roles;
  insert into public.user_roles (user_id, role)
  values (new.id, case when user_count = 0 then 'admin'::public.app_role else 'staff'::public.app_role end);
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- =========================
-- LOOKUPS
-- =========================
create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  status public.entity_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status public.entity_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.governorates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0
);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status public.entity_status not null default 'active'
);

create table public.expense_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status public.entity_status not null default 'active'
);

create table public.center_settings (
  id boolean primary key default true check (id),
  center_name text not null default 'السنتر التعليمي',
  logo_url text,
  whatsapp_templates jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.center_settings (id) values (true);

-- =========================
-- GROUPS
-- =========================
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  academic_year_id uuid references public.academic_years(id) on delete restrict,
  location_id uuid references public.locations(id) on delete restrict,
  schedule_time text,
  study_days text[] not null default '{}',
  billing_system public.billing_system not null default 'monthly',
  billing_type public.billing_type not null default 'prepaid',
  fee numeric(10,2) not null default 0,
  status public.group_status not null default 'open',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_groups_year on public.groups(academic_year_id);
create index idx_groups_location on public.groups(location_id);
create index idx_groups_status on public.groups(status);

-- =========================
-- STUDENTS
-- =========================
create sequence public.student_code_seq start 1001;
create table public.students (
  id uuid primary key default gen_random_uuid(),
  code int not null unique default nextval('public.student_code_seq'),
  full_name text not null,
  phone text,
  guardian_phone text,
  governorate_id uuid references public.governorates(id) on delete set null,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  group_id uuid references public.groups(id) on delete set null,
  fee numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  exemption numeric(10,2) not null default 0,
  final_amount numeric(10,2) generated always as (greatest(fee - discount - exemption, 0)) stored,
  status public.student_status not null default 'active',
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter sequence public.student_code_seq owned by public.students.code;
create index idx_students_group on public.students(group_id);
create index idx_students_year on public.students(academic_year_id);
create index idx_students_status on public.students(status);
create index idx_students_name on public.students(full_name);
create index idx_students_phone on public.students(phone);

-- =========================
-- SESSIONS + ATTENDANCE
-- =========================
create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  session_date date not null,
  session_number int not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  unique (group_id, session_date)
);
create index idx_sessions_group_date on public.class_sessions(group_id, session_date desc);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status public.attendance_status not null default 'present',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, student_id)
);
create index idx_attendance_student on public.attendance(student_id);

-- =========================
-- DUES + PAYMENTS
-- =========================
create table public.dues (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  period_label text not null,
  due_date date not null default current_date,
  amount numeric(10,2) not null default 0,
  paid_amount numeric(10,2) not null default 0,
  status public.due_status not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, period_label)
);
create index idx_dues_student on public.dues(student_id);
create index idx_dues_status on public.dues(status);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  due_id uuid references public.dues(id) on delete set null,
  amount numeric(10,2) not null check (amount > 0),
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  paid_at date not null default current_date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_payments_student on public.payments(student_id);
create index idx_payments_date on public.payments(paid_at desc);

-- keep dues in sync with payments
create or replace function public.sync_due_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare target uuid; total numeric;
begin
  target := coalesce(new.due_id, old.due_id);
  if target is null then return coalesce(new, old); end if;
  select coalesce(sum(amount),0) into total from public.payments where due_id = target;
  update public.dues set paid_amount = total,
    status = case when total <= 0 then 'unpaid'::public.due_status
                  when total >= amount then 'paid'::public.due_status
                  else 'partial'::public.due_status end,
    updated_at = now()
  where id = target;
  return coalesce(new, old);
end; $$;
create trigger trg_payments_sync after insert or update or delete on public.payments
for each row execute function public.sync_due_totals();

-- =========================
-- EXPENSES
-- =========================
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  expense_type_id uuid references public.expense_types(id) on delete set null,
  amount numeric(10,2) not null check (amount > 0),
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_expenses_date on public.expenses(expense_date desc);

-- =========================
-- GRANTS + RLS (staff = read/write, admin = delete)
-- =========================
do $$
declare t text;
begin
  foreach t in array array['academic_years','locations','governorates','payment_methods','expense_types',
                           'center_settings','groups','students','class_sessions','attendance','dues','payments','expenses']
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "read for authenticated" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "insert for authenticated" on public.%I for insert to authenticated with check (true)', t);
    execute format('create policy "update for authenticated" on public.%I for update to authenticated using (true) with check (true)', t);
    execute format('create policy "delete for admin" on public.%I for delete to authenticated using (public.has_role(auth.uid(), ''admin''))', t);
  end loop;
end $$;

grant usage, select on sequence public.student_code_seq to authenticated;

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['academic_years','locations','groups','students','attendance','dues','payments','expenses']
  loop
    execute format('create trigger trg_%s_updated before update on public.%I for each row execute function public.update_updated_at_column()', t, t);
  end loop;
end $$;

-- =========================
-- SEED LOOKUPS
-- =========================
insert into public.academic_years (name, sort_order) values ('تأسيس',1),('أولى ثانوي',2),('ثانية ثانوي',3);
insert into public.locations (name) values ('فرع فوه'),('فرع دسوق'),('أون لاين'),('Mini Private');
insert into public.payment_methods (name) values ('نقدي'),('إنستاباي'),('فودافون كاش'),('تحويل بنكي');
insert into public.expense_types (name) values ('إيجار'),('كهرباء'),('مياه'),('رواتب'),('دعاية'),('صيانة'),('إنترنت'),('أخرى');
insert into public.governorates (name, sort_order) values
('القاهرة',1),('الجيزة',2),('الإسكندرية',3),('الدقهلية',4),('البحر الأحمر',5),('البحيرة',6),('الفيوم',7),
('الغربية',8),('الإسماعيلية',9),('المنوفية',10),('المنيا',11),('القليوبية',12),('الوادي الجديد',13),
('السويس',14),('أسوان',15),('أسيوط',16),('بني سويف',17),('بورسعيد',18),('دمياط',19),('الشرقية',20),
('جنوب سيناء',21),('كفر الشيخ',22),('مطروح',23),('الأقصر',24),('قنا',25),('شمال سيناء',26),('سوهاج',27);