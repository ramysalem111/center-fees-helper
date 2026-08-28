import { supabase } from "@/integrations/supabase/client";

/** يرجع قائمة الأشهر (YYYY-MM) من شهر البداية حتى الشهر التالي (للسماح بالدفع المقدم) */
export function monthsFrom(startLabel: string): string[] {
  const [sy, sm] = (startLabel ?? "").split("-").map(Number);
  if (!sy || !sm || sy < 2000) return [];
  const now = new Date();
  // الحد الأقصى = الشهر التالي للشهر الحالي حتى يمكن تحصيل دفع مقدم
  const limit = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const out: string[] = [];
  let y = sy;
  let m = sm - 1;
  while (y < limit.getFullYear() || (y === limit.getFullYear() && m <= limit.getMonth())) {
    out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return out;
}

/** قيمة الاشتراك الفعلية للطالب (مع احتياطي الحساب لو final_amount غير محسوب) */
export const studentAmount = (s?: {
  final_amount?: number | null;
  fee?: number | null;
  discount?: number | null;
  exemption?: number | null;
} | null) => {
  const final = Number(s?.final_amount ?? 0);
  if (final > 0) return final;
  return Math.max(Number(s?.fee ?? 0) - Number(s?.discount ?? 0) - Number(s?.exemption ?? 0), 0);
};


export const monthAr = (label: string) => {
  const [y, m] = label.split("-");
  if (!y || !m) return label;
  return new Intl.DateTimeFormat("ar-EG", { month: "long", year: "numeric" }).format(
    new Date(Number(y), Number(m) - 1, 1),
  );
};

/** شهر (YYYY-MM) من تاريخ */
export const monthOf = (date?: string | null) => (date ? String(date).slice(0, 7) : "");

/** الشهر السابق والحالي والتالي فقط (YYYY-MM) */
export function nearbyMonths(base?: string): string[] {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth();
  if (base && /^\d{4}-\d{2}$/.test(base)) {
    const [by, bm] = base.split("-").map(Number);
    y = by; m = bm - 1;
  }
  return [-1, 0, 1].map((off) => {
    const d = new Date(y, m + off, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

/**
 * شهر بداية استحقاق الطالب = الأحدث بين شهر تفعيل المجموعة وشهر تسجيل الطالب.
 * فالطالب لا يستحق أشهر سابقة لتسجيله ولا أشهر سابقة لتفعيل المجموعة.
 */
export const studentStartMonth = (studentCreatedAt?: string | null, activatedAt?: string | null) => {
  const joined = monthOf(studentCreatedAt);
  const start = (activatedAt ?? "").slice(0, 7);
  if (!joined) return start;
  if (!start) return joined;
  return joined > start ? joined : start;
};

/** ترجع أشهر استحقاق الطالب حتى الشهر الحالي */
export const studentDueLabels = (studentCreatedAt?: string | null, activatedAt?: string | null) =>
  monthsFrom(studentStartMonth(studentCreatedAt, activatedAt));

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
    .select("id, final_amount, fee, discount, exemption, created_at")
    .eq("group_id", groupId)
    .eq("status", "active")
    .eq("archived", false);
  if (!students?.length) return 0;

  const { data: existing } = await supabase
    .from("dues")
    .select("id, student_id, period_label, group_id, paid_amount, amount")
    .in("student_id", students.map((s) => s.id))
    .in("period_label", labels);
  const byKey = new Map((existing ?? []).map((d) => [`${d.student_id}|${d.period_label}`, d]));

  const rows: any[] = [];
  for (const s of students) {
    const own = new Set(studentDueLabels(s.created_at, start));
    for (const label of labels) {
      if (!own.has(label)) continue;
      const prev = byKey.get(`${s.id}|${label}`);
      if (prev) {
        // استحقاق موجود لنفس الشهر: لو مدفوع لا نكرره، ولو غير مدفوع ننقله للمجموعة الجديدة
        const patch: any = {};
        if (Number(prev.paid_amount ?? 0) <= 0 && prev.group_id !== groupId) patch.group_id = groupId;
        // تصحيح استحقاق بقيمة صفر (اشتراك لم يكن محسوباً وقت الإنشاء)
        if (Number((prev as any).amount ?? 0) <= 0 && studentAmount(s) > 0) patch.amount = studentAmount(s);
        if (Object.keys(patch).length) await supabase.from("dues").update(patch).eq("id", prev.id);
        continue;
      }
      rows.push({
        student_id: s.id,
        group_id: groupId,
        amount: studentAmount(s),
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
    .select("id, status, archived, group_id, final_amount, fee, discount, exemption, created_at")
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

  // نقل الطالب لمجموعة أخرى: تنتقل استحقاقاته (غير المسددة كاملاً) للمجموعة الجديدة
  const { data: others } = await supabase
    .from("dues")
    .select("id, group_id, amount, paid_amount, status")
    .eq("student_id", studentId)
    .neq("group_id", s.group_id as string);
  for (const d of others ?? []) {
    if (d.status === "paid") continue; // سجل مالي منتهي يبقى على مجموعته
    await supabase
      .from("dues")
      .update({
        group_id: s.group_id,
        amount: Number(d.paid_amount ?? 0) > 0 ? Number(d.amount ?? 0) : studentAmount(s),
      })
      .eq("id", d.id);
  }

  // أقدم استحقاق سابق للطالب: الطالب المنقول يظل مستحقاً من نفس بدايته القديمة
  const { data: allDues } = await supabase
    .from("dues")
    .select("period_label")
    .eq("student_id", studentId)
    .order("period_label", { ascending: true })
    .limit(1);
  const earliest = allDues?.[0]?.period_label as string | undefined;

  if (!g?.is_active && !earliest) return;

  let start = studentStartMonth(s.created_at, g?.activated_at ?? new Date().toISOString().slice(0, 7));
  if (earliest && (!start || earliest < start)) start = earliest;

  const labels = monthsFrom(start);
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
      amount: studentAmount(s),
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
  const { data: student } = await supabase
    .from("students")
    .select("final_amount, fee, discount, exemption, group_id")
    .eq("id", studentId)
    .maybeSingle();

  // استحقاق موجود لكن بقيمة صفر (اشتراك لم يكن محسوباً) => نصححه
  if (found) {
    const value = studentAmount(student);
    if (Number((found as any).amount ?? 0) <= 0 && value > 0) {
      const { data: fixed } = await supabase
        .from("dues")
        .update({ amount: value })
        .eq("id", (found as any).id)
        .select("*")
        .single();
      return fixed ?? found;
    }
    return found;
  }

  const { data, error } = await supabase
    .from("dues")
    .insert({
      student_id: studentId,
      group_id: groupId ?? student?.group_id ?? null,
      amount: studentAmount(student),
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