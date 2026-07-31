import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export const SECTIONS = [
  { key: "dashboard", label: "لوحة التحكم", url: "/dashboard" },
  { key: "students", label: "الطلاب", url: "/students" },
  { key: "groups", label: "المجموعات", url: "/groups" },
  { key: "attendance", label: "الحضور", url: "/attendance" },
  { key: "attendance-record", label: "تسجيل الحضور", url: "/attendance-record" },
  { key: "payments", label: "المدفوعات", url: "/payments" },
  { key: "other-income", label: "إيرادات أخرى", url: "/other-income" },
  { key: "expenses", label: "المصروفات", url: "/expenses" },
  { key: "reports", label: "التقارير", url: "/reports" },
  { key: "notifications", label: "الإشعارات", url: "/notifications" },
  { key: "settings", label: "الإعدادات", url: "/settings" },
] as const;

export type SectionKey = (typeof SECTIONS)[number]["key"];

export const DEFAULT_STAFF_SECTIONS: SectionKey[] = [
  "dashboard",
  "students",
  "groups",
  "attendance",
  "attendance-record",
  "payments",
];

export function usePermissions() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-permissions"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return { isAdmin: false, sections: [] as string[] };
      const [roles, perms] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("user_permissions").select("section").eq("user_id", uid),
      ]);
      const isAdmin = (roles.data ?? []).some((r) => r.role === "admin");
      const sections = (perms.data ?? []).map((p) => p.section);
      return { isAdmin, sections };
    },
  });

  const isAdmin = data?.isAdmin ?? false;
  const stored = data?.sections ?? [];
  const allowed = isAdmin
    ? SECTIONS.map((s) => s.key as string)
    : stored.length
      ? stored
      : (DEFAULT_STAFF_SECTIONS as string[]);

  return {
    loading: isLoading,
    isAdmin,
    allowed,
    can: (key: string) => allowed.includes(key),
  };
}