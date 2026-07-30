import { supabase } from "@/integrations/supabase/client";

/** يولّد استحقاقات الشهر الحالي لكل الطلاب النشطين في المجموعات الشهرية */
export async function generateMonthlyDues(period?: string) {
  const now = new Date();
  const label = period ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dueDate = `${label}-01`;

  const { data: students, error } = await supabase
    .from("students")
    .select("id, group_id, final_amount, groups!inner(billing_system)")
    .eq("status", "active")
    .eq("archived", false)
    .eq("groups.billing_system", "monthly");
  if (error) throw error;

  const { data: existing } = await supabase.from("dues").select("student_id").eq("period_label", label);
  const have = new Set((existing ?? []).map((d) => d.student_id));

  const rows = (students ?? [])
    .filter((s) => !have.has(s.id))
    .map((s) => ({
      student_id: s.id,
      group_id: s.group_id,
      amount: Number(s.final_amount ?? 0),
      period_label: label,
      due_date: dueDate,
    }));

  if (!rows.length) return 0;
  const { error: insErr } = await supabase.from("dues").insert(rows);
  if (insErr) throw insErr;
  return rows.length;
}

/** يولّد استحقاق دورة (8 حصص) لطلاب مجموعة تعمل بنظام الحصص */
export async function generateSessionDues(groupId: string) {
  const { data: group } = await supabase.from("groups").select("id, name").eq("id", groupId).maybeSingle();
  if (!group) throw new Error("المجموعة غير موجودة");

  const { count } = await supabase
    .from("dues")
    .select("*", { count: "exact", head: true })
    .eq("group_id", groupId);
  const cycle = Math.floor((count ?? 0) / Math.max(1, 1)) + 1;
  const label = `دورة ${cycle} (8 حصص)`;

  const { data: students } = await supabase
    .from("students")
    .select("id, final_amount")
    .eq("group_id", groupId)
    .eq("status", "active")
    .eq("archived", false);

  const { data: existing } = await supabase
    .from("dues")
    .select("student_id")
    .eq("group_id", groupId)
    .eq("period_label", label);
  const have = new Set((existing ?? []).map((d) => d.student_id));

  const rows = (students ?? [])
    .filter((s) => !have.has(s.id))
    .map((s) => ({
      student_id: s.id,
      group_id: groupId,
      amount: Number(s.final_amount ?? 0),
      period_label: label,
      due_date: new Date().toISOString().slice(0, 10),
    }));

  if (!rows.length) return 0;
  const { error } = await supabase.from("dues").insert(rows);
  if (error) throw error;
  return rows.length;
}