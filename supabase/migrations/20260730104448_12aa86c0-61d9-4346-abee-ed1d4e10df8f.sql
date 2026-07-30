CREATE TABLE public.billing_systems (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'monthly',
  sort_order integer not null default 0,
  status public.entity_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_systems TO authenticated;
GRANT ALL ON public.billing_systems TO service_role;
ALTER TABLE public.billing_systems ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read for authenticated" ON public.billing_systems FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert for authenticated" ON public.billing_systems FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update for authenticated" ON public.billing_systems FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete for admin" ON public.billing_systems FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.collection_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null default 'prepaid',
  sort_order integer not null default 0,
  status public.entity_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collection_types TO authenticated;
GRANT ALL ON public.collection_types TO service_role;
ALTER TABLE public.collection_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read for authenticated" ON public.collection_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert for authenticated" ON public.collection_types FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update for authenticated" ON public.collection_types FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete for admin" ON public.collection_types FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.group_statuses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null default 'listed',
  sort_order integer not null default 0,
  status public.entity_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_statuses TO authenticated;
GRANT ALL ON public.group_statuses TO service_role;
ALTER TABLE public.group_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read for authenticated" ON public.group_statuses FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert for authenticated" ON public.group_statuses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update for authenticated" ON public.group_statuses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete for admin" ON public.group_statuses FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_billing_systems_updated BEFORE UPDATE ON public.billing_systems FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_collection_types_updated BEFORE UPDATE ON public.collection_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_group_statuses_updated BEFORE UPDATE ON public.group_statuses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.groups
  ADD COLUMN billing_system_id uuid REFERENCES public.billing_systems(id) ON DELETE SET NULL,
  ADD COLUMN collection_type_id uuid REFERENCES public.collection_types(id) ON DELETE SET NULL,
  ADD COLUMN status_id uuid REFERENCES public.group_statuses(id) ON DELETE SET NULL;

INSERT INTO public.billing_systems (name, kind, sort_order) VALUES ('شهري', 'monthly', 1), ('كل 8 حصص', 'sessions', 2);
INSERT INTO public.collection_types (name, code, sort_order) VALUES ('مقدم', 'prepaid', 1), ('مؤخر', 'postpaid', 2);
INSERT INTO public.group_statuses (name, code, sort_order) VALUES ('قائمة', 'listed', 1), ('منتهية', 'finished', 2);

UPDATE public.groups g SET billing_system_id = (SELECT id FROM public.billing_systems b WHERE b.kind = (CASE WHEN g.billing_system = 'monthly' THEN 'monthly' ELSE 'sessions' END) LIMIT 1);
UPDATE public.groups g SET collection_type_id = (SELECT id FROM public.collection_types c WHERE c.code = g.billing_type::text LIMIT 1);
UPDATE public.groups g SET status_id = (SELECT id FROM public.group_statuses s WHERE s.code = (CASE WHEN g.status IN ('finished','archived') THEN 'finished' ELSE 'listed' END) LIMIT 1);

INSERT INTO public.locations (name)
SELECT v.name FROM (VALUES ('اونلاين'), ('Mini Private'), ('سنتر'), ('منزل')) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM public.locations l WHERE l.name = v.name);