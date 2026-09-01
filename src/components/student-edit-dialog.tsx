import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { applyPermanentExempt, syncStudentDues } from "@/lib/dues";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EGP, STUDENT_STATUS } from "@/lib/format";

const schema = z.object({
  full_name: z.string().trim().min(2, "الاسم مطلوب").max(120),
  phone: z.string().trim().max(20).optional(),
  guardian_phone: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(1000).optional(),
});

type Form = {
  full_name: string;
  phone: string;
  guardian_phone: string;
  governorate_id: string;
  academic_year_id: string;
  group_id: string;
  fee: string;
  discount: string;
  exemption: string;
  status: string;
  notes: string;
  permanent_exempt: boolean;
};

const empty: Form = {
  full_name: "",
  phone: "",
  guardian_phone: "",
  governorate_id: "",
  academic_year_id: "",
  group_id: "",
  fee: "0",
  discount: "0",
  exemption: "0",
  status: "active",
  notes: "",
  permanent_exempt: false,
};

/** نافذة تعديل بيانات طالب (قابلة للاستخدام من أي شاشة) */
export function StudentEditDialog({
  studentId,
  onClose,
}: {
  studentId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(empty);

  const { data: lookups } = useQuery({
    queryKey: ["lookups"],
    queryFn: async () => {
      const [years, groups, govs] = await Promise.all([
        supabase.from("academic_years").select("id, name").order("sort_order"),
        supabase.from("groups").select("id, name, fee").order("name"),
        supabase.from("governorates").select("id, name").order("sort_order"),
      ]);
      return { years: years.data ?? [], groups: groups.data ?? [], govs: govs.data ?? [] };
    },
  });

  const { data: student } = useQuery({
    queryKey: ["student-edit", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").eq("id", studentId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!student) return;
    const s = student as any;
    setForm({
      full_name: s.full_name ?? "",
      phone: s.phone ?? "",
      guardian_phone: s.guardian_phone ?? "",
      governorate_id: s.governorate_id ?? "",
      academic_year_id: s.academic_year_id ?? "",
      group_id: s.group_id ?? "",
      fee: String(s.fee ?? 0),
      discount: String(s.discount ?? 0),
      exemption: String(s.exemption ?? 0),
      status: s.status ?? "active",
      notes: s.notes ?? "",
      permanent_exempt: !!s.permanent_exempt,
    });
  }, [student]);

  const save = useMutation({
    mutationFn: async (values: Form) => {
      if (!studentId) return;
      const parsed = schema.safeParse(values);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const payload = {
        full_name: values.full_name.trim(),
        phone: values.phone.trim() || null,
        guardian_phone: values.guardian_phone.trim() || null,
        governorate_id: values.governorate_id || null,
        academic_year_id: values.academic_year_id || null,
        group_id: values.group_id || null,
        fee: Number(values.fee) || 0,
        discount: Number(values.discount) || 0,
        exemption: Number(values.exemption) || 0,
        status: values.status as never,
        notes: values.notes.trim() || null,
        permanent_exempt: values.permanent_exempt,
      };
      if (payload.phone) {
        const { data: existing } = await supabase
          .from("students")
          .select("id")
          .eq("phone", payload.phone)
          .neq("id", studentId)
          .limit(1);
        if (existing && existing.length > 0) throw new Error("رقم الهاتف مسجل بالفعل لطالب آخر");
      }
      const { error } = await supabase.from("students").update(payload).eq("id", studentId);
      if (error) throw new Error(error.code === "23505" ? "رقم الهاتف مسجل بالفعل لطالب آخر" : error.message);
      await syncStudentDues(studentId);
      // الإعفاء الدائم يُطبَّق/يُلغى من الشهر الحالي وما بعده فقط
      await applyPermanentExempt(studentId, values.permanent_exempt);
    },
    onSuccess: () => {
      toast.success("تم حفظ بيانات الطالب");
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["students-counts"] });
      qc.invalidateQueries({ queryKey: ["dues"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["student-edit"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!studentId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>تعديل بيانات الطالب</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="الاسم" className="sm:col-span-2">
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </F>
          <F label="واتساب الطالب">
            <Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </F>
          <F label="رقم ولي الأمر">
            <Input dir="ltr" value={form.guardian_phone} onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })} />
          </F>
          <F label="المحافظة">
            <Picker value={form.governorate_id} onChange={(v) => setForm({ ...form, governorate_id: v })} options={lookups?.govs ?? []} placeholder="اختياري" />
          </F>
          <F label="السنة الدراسية">
            <Picker value={form.academic_year_id} onChange={(v) => setForm({ ...form, academic_year_id: v })} options={lookups?.years ?? []} />
          </F>
          <F label="المجموعة">
            <Picker
              value={form.group_id}
              onChange={(v) => {
                const g = lookups?.groups.find((x: any) => x.id === v) as any;
                setForm({ ...form, group_id: v, fee: g ? String(g.fee) : form.fee });
              }}
              options={lookups?.groups ?? []}
            />
          </F>
          <F label="الحالة">
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STUDENT_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="قيمة الاشتراك">
            <Input type="number" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} />
          </F>
          <F label="الخصم">
            <Input type="number" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
          </F>
          <F label="الإعفاء">
            <Input type="number" value={form.exemption} onChange={(e) => setForm({ ...form, exemption: e.target.value })} />
          </F>
          <F label="ملاحظات" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </F>
          <div className="flex items-start justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-semibold">إعفاء من كل الشهور القادمة</p>
              <p className="text-xs text-muted-foreground">
                يُعفى الطالب من الشهر الحالي وكل الشهور القادمة. إلغاء الإعفاء يعيد الاستحقاق من الشهر الحالي وما بعده
                فقط دون تغيير الشهور السابقة.
              </p>
            </div>
            <Switch
              checked={form.permanent_exempt}
              onCheckedChange={(v) => setForm({ ...form, permanent_exempt: v })}
            />
          </div>
          <p className="rounded-lg bg-muted p-2 text-sm sm:col-span-2">
            المبلغ النهائي:{" "}
            <strong>
              {form.permanent_exempt
                ? "معفى"
                : EGP(Math.max(Number(form.fee) - Number(form.discount) - Number(form.exemption), 0))}
            </strong>
          </p>
        </div>
        <DialogFooter>
          <Button disabled={save.isPending} onClick={() => save.mutate(form)}>
            {save.isPending ? "جارٍ الحفظ..." : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Picker({
  value,
  onChange,
  options,
  placeholder = "اختر",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
  placeholder?: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
