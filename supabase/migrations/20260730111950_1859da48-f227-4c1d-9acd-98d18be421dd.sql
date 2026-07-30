ALTER TABLE public.groups ALTER COLUMN activated_at TYPE text USING (
  CASE
    WHEN activated_at IS NULL THEN NULL
    ELSE to_char(activated_at, 'YYYY-MM')
  END
);

COMMENT ON COLUMN public.groups.activated_at IS 'شهر تفعيل المجموعة بتنسيق YYYY-MM';