import { supabase } from "@/integrations/supabase/client";

/** يرجع قائمة الأشهر (YYYY-MM) من شهر البداية حتى الشهر الحالي */
export function monthsFrom(startLabel: string): string[] {
  const [sy, sm] = (startLabel ?? "").split("-").map(Number);
  if (!sy || !sm || sy < 2000) return [];
  const now = new Date();
  const out: string[] = [];
  let y = sy;
  let m = sm - 1;
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth())) {
    out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return out;
}

export const monthAr = (label: string) => {
  const [y, m] = label.split("-");
  if (!y || !m) return label;
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
    .select("id, activated_at, is_active")
    .eq("is_active", true);
  if (gErr) throw gErr;
  if (!groups?.length) return 0;

  let created = 0;
  for (const g of groups) {
    created += await generateGroupMonthlyDues(g.id, g.activated_at ?? undefined);
  }
  return created;
}

/** يولّد استحقاقات مجموعة واحدة من شهر تفعيلها (YYYY-MM) */
export async function generateGroupMonthlyDues(groupId: string, activatedAt?: string) {
  let start = activatedAt;
  if (!start) {
    const { data: g } = await supabase.from("groups").select("activated_at").eq("id", groupId).maybeSingle();
    start = g?.activated_at ?? new Date().toISOString().slice(0, 7);
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
    .select("id, student_id, period_label, group_id, paid_amount")
    .in("student_id", students.map((s) => s.id))
    .in("period_label", labels);
  const byKey = new Map((existing ?? []).map((d) => [`${d.student_id}|${d.period_label}`, d]));

  const rows: any[] = [];
  for (const label of labels) {
    for (const s of students) {
      const prev = byKey.get(`${s.id}|${label}`);
      if (prev) {
        // استحقاق موجود لنفس الشهر: لو مدفوع لا نكرره، ولو غير مدفوع ننقله للمجموعة الجديدة
        if (Number(prev.paid_amount ?? 0) <= 0 && prev.group_id !== groupId) {
          await supabase
            .from("dues")
            .update({ group_id: groupId, amount: Number(s.final_amount ?? 0) })
            .eq("id", prev.id);
        }
        continue;
      }
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

/**
 * عند إيقاف الطالب أو إخراجه من المجموعة: حذف الاستحقاقات غير المدفوعة
 * (الاستحقاقات المدفوعة أو المدفوعة جزئياً تبقى كسجل مالي).
 */
export async function removeUnpaidDues(studentId: string, groupId?: string | null) {
  let q = supabase
    .from("dues")
    .delete()
    .eq("student_id", studentId)
    .lte("paid_amount", 0)
    .neq("status", "exempt");
  if (groupId) q = q.eq("group_id", groupId);
  const { error } = await q;
  if (error) throw error;
}

/**
 * مزامنة استحقاقات الطالب بعد تعديل بياناته:
 * - موقوف / منسحب / مؤرشف / بدون مجموعة => لا استحقاق (تُحذف غير المدفوعة).
 * - انتقل لمجموعة أخرى => تُنقل الاستحقاقات غير المدفوعة للمجموعة الجديدة،
 *   والأشهر المدفوعة بالفعل لا يتم إنشاء استحقاق جديد لها.
 */
export async function syncStudentDues(studentId: string) {
  const { data: s } = await supabase
    .from("students")
    .select("id, status, archived, group_id, final_amount")
    .eq("id", studentId)
    .maybeSingle();
  if (!s) return;

  const inactive = s.status !== "active" || s.archived || !s.group_id;
  if (inactive) {
    await removeUnpaidDues(studentId);
    return;
  }

  const { data: g } = await supabase
    .from("groups")
    .select("id, is_active, activated_at, billing_system")
    .eq("id", s.group_id as string)
    .maybeSingle();

  // استحقاقات غير مدفوعة تخص مجموعات قديمة => تُحذف
  const { data: stale } = await supabase
    .from("dues")
    .select("id, group_id, paid_amount")
    .eq("student_id", studentId)
    .lte("paid_amount", 0)
    .neq("status", "exempt");
  const staleIds = (stale ?? []).filter((d) => d.group_id && d.group_id !== s.group_id).map((d) => d.id);
  if (staleIds.length) await supabase.from("dues").delete().in("id", staleIds);

  if (!g?.is_active) return;

  const labels = monthsFrom(g.activated_at ?? new Date().toISOString().slice(0, 7));
  if (!labels.length) return;

  const { data: existing } = await supabase
    .from("dues")
    .select("period_label")
    .eq("student_id", studentId)
    .in("period_label", labels);
  const have = new Set((existing ?? []).map((d) => d.period_label));

  const rows = labels
    .filter((l) => !have.has(l))
    .map((l) => ({
      student_id: studentId,
      group_id: s.group_id,
      amount: Number(s.final_amount ?? 0),
      period_label: l,
      due_date: `${l}-01`,
    }));
  if (rows.length) await supabase.from("dues").insert(rows);
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

/** بداية ونهاية الشهر (لصلاحية الدفع طوال الشهر) */
export function monthRange(label: string) {
  const [y, m] = label.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${label}-01`, end: `${label}-${String(last).padStart(2, "0")}` };
}