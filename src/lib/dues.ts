import { supabase } from "@/integrations/supabase/client";

/** يرجع قائمة الأشهر (YYYY-MM) من تاريخ البداية حتى الشهر الحالي */
export function monthsFrom(startISO: string): string[] {
  const start = new Date(startISO);
  const now = new Date();
  const out: string[] = [];
  let y = start.getFullYear();
  let m = start.getMonth();
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth())) {
    out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return out;
}

export const monthAr = (label: string) => {
  const [y, m] = label.split("-");
  return new Intl.DateTimeFormat("ar-EG", { month: "long", year: "numeric" }).format(
    new Date(Number(y), Number(m) - 1, 1),
  );
};

/**
 * يولّد الاستحقاقات الشهرية لكل مجموعة مُفعَّلة، من شهر التفعيل حتى الشهر الحالي،
 * بدون تكرار نفس الشهر لنفس الطالب.
 */
export async function generateMonthlyDues() {
  const { data: groups, error: gErr } = await supabase
    .from("groups")
    .select("id, activated_at, is_active, billing_system")
    .eq("is_active", true)
    .eq("billing_system", "monthly");
  if (gErr) throw gErr;
  if (!groups?.length) return 0;

  let created = 0;
  for (const g of groups) {
    created += await generateGroupMonthlyDues(g.id, g.activated_at ?? undefined);
  }
  return created;
}

/** يولّد استحقاقات مجموعة واحدة من تاريخ تفعيلها */
export async function generateGroupMonthlyDues(groupId: string, activatedAt?: string) {
  let start = activatedAt;
  if (!start) {
    const { data: g } = await supabase.from("groups").select("activated_at").eq("id", groupId).maybeSingle();
    start = g?.activated_at ?? new Date().toISOString().slice(0, 10);
  }
  const labels = monthsFrom(start);
  if (!labels.length) return 0;

  const { data: students } = await supabase
    .from("students")
    .select("id, final_amount")
    .eq("group_id", groupId)
    .eq("status", "active")
    .eq("archived", false);
  if (!students?.length) return 0;

  const { data: existing } = await supabase
    .from("dues")
    .select("student_id, period_label")
    .eq("group_id", groupId)
    .in("period_label", labels);
  const have = new Set((existing ?? []).map((d) => `${d.student_id}|${d.period_label}`));

  const rows: any[] = [];
  for (const label of labels) {
    for (const s of students) {
      if (have.has(`${s.id}|${label}`)) continue;
      rows.push({
        student_id: s.id,
        group_id: groupId,
        amount: Number(s.final_amount ?? 0),
        period_label: label,
        due_date: `${label}-01`,
      });
    }
  }
  if (!rows.length) return 0;
  const { error } = await supabase.from("dues").insert(rows);
  if (error) throw error;
  return rows.length;
}

/** يضمن وجود استحقاق لشهر محدد لطالب محدد ويرجعه (لمنع التكرار) */
export async function ensureDueForMonth(studentId: string, groupId: string | null, label: string) {
  const { data: found } = await supabase
    .from("dues")
    .select("*")
    .eq("student_id", studentId)
    .eq("period_label", label)
    .maybeSingle();
  if (found) return found;

  const { data: student } = await supabase
    .from("students")
    .select("final_amount, group_id")
    .eq("id", studentId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("dues")
    .insert({
      student_id: studentId,
      group_id: groupId ?? student?.group_id ?? null,
      amount: Number(student?.final_amount ?? 0),
      period_label: label,
      due_date: `${label}-01`,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** يولّد استحقاق دورة (8 حصص) لطلاب مجموعة تعمل بنظام الحصص */
export async function generateSessionDues(groupId: string) {
  const { data: group } = await supabase.from("groups").select("id, name").eq("id", groupId).maybeSingle();
  if (!group) throw new Error("المجموعة غير موجودة");

  const { data: previous } = await supabase.from("dues").select("period_label").eq("group_id", groupId);
  const cycles = new Set((previous ?? []).map((d) => d.period_label));
  const label = `دورة ${cycles.size + 1} (8 حصص)`;

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