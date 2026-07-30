ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS activated_at date,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;

DELETE FROM public.dues a USING public.dues b
WHERE a.ctid < b.ctid
  AND a.student_id = b.student_id
  AND a.period_label = b.period_label
  AND coalesce(a.group_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(b.group_id, '00000000-0000-0000-0000-000000000000'::uuid);

CREATE UNIQUE INDEX IF NOT EXISTS dues_student_period_group_uidx
  ON public.dues (student_id, period_label, coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid));