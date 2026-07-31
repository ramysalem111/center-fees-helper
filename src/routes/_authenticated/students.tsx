import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { MessageCircle, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { syncStudentDues } from "@/lib/dues";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EGP, STUDENT_STATUS, waLink } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/students")({
  head: () => ({
    meta: [
      { title: "الطلاب | نظام إدارة السنتر" },
      { name: "description", content: "إضافة وتعديل الطلاب ونقلهم بين المجموعات ومتابعة حالتهم." },
      { property: "og:title", content: "الطلاب | نظام إدارة السنتر" },
      { property: "og:description", content: "سجل الطلاب الكامل مع الرسوم والخصومات والحالة." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({ q: typeof s.q === "string" ? s.q : "" }),
  component: StudentsPage,
});

type StudentForm = {
  id?: string;
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
};

const empty: StudentForm = {
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
};

const schema = z.object({
  full_name: z.string().trim().min(2, "الاسم مطلوب").max(120),
  phone: z.string().trim().max(20).optional(),
  guardian_phone: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(1000).optional(),
});

function StudentsPage() {
  const { q } = Route.useSearch();
  const [term, setTerm] = useState(q);
  const [statusFilter, setStatusFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [discountFilter, setDiscountFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<StudentForm>(empty);
  const [target, setTarget] = useState<any | null>(null);
  const [pwd, setPwd] = useState("");
  const qc = useQueryClient();

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

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["students", term, statusFilter, groupFilter, discountFilter],
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select("*, groups(name), academic_years(name)")
        .eq("archived", false)
        .order("created_at", { ascending: false })
        .limit(500);
      if (statusFilter !== "all") query = query.eq("status", statusFilter as never);
      if (groupFilter !== "all") query = query.eq("group_id", groupFilter);
      if (discountFilter === "discount") query = query.gt("discount", 0);
      if (discountFilter === "exemption") query = query.gt("exemption", 0);
      if (discountFilter === "either") query = query.or("discount.gt.0,exemption.gt.0");
      const t = term.trim();
      if (t) {
        query = /^\d+$/.test(t)
          ? query.or(`code.eq.${t},phone.ilike.%${t}%,guardian_phone.ilike.%${t}%`)
          : query.ilike("full_name", `%${t}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (values: StudentForm) => {
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
      };
      if (payload.phone) {
        let dup = supabase.from("students").select("id").eq("phone", payload.phone).limit(1);
        if (values.id) dup = dup.neq("id", values.id);
        const { data: existing } = await dup;
        if (existing && existing.length > 0) {
          throw new Error("رقم الهاتف مسجل بالفعل لطالب آخر");
        }
      }
      if (values.id) {
        const { error } = await supabase.from("students").update(payload).eq("id", values.id);
        if (error) throw new Error(error.code === "23505" ? "رقم الهاتف مسجل بالفعل لطالب آخر" : error.message);
        await syncStudentDues(values.id);
      } else {
        const { data, error } = await supabase.from("students").insert(payload).select("id").single();
        if (error) throw new Error(error.code === "23505" ? "رقم الهاتف مسجل بالفعل لطالب آخر" : error.message);
        if (data?.id) await syncStudentDues(data.id);
      }
    },
    onSuccess: () => {
      toast.success("تم حفظ بيانات الطالب");
      setOpen(false);
      setForm(empty);
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["dues"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      if (password !== "delete") throw new Error("كلمة السر غير صحيحة");
      await supabase.from("attendance").delete().eq("student_id", id);
      await supabase.from("payments").delete().eq("student_id", id);
      await supabase.from("dues").delete().eq("student_id", id);
      const { error } = await supabase.from("students").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف الطالب");
      setTarget(null);
      setPwd("");
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["dues"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totals = useMemo(
    () => students.reduce((s, st: any) => s + Number(st.final_amount ?? 0), 0),
    [students],
  );

  function edit(s: any) {
    setForm({
      id: s.id,
      full_name: s.full_name,
      phone: s.phone ?? "",
      guardian_phone: s.guardian_phone ?? "",
      governorate_id: s.governorate_id ?? "",
      academic_year_id: s.academic_year_id ?? "",
      group_id: s.group_id ?? "",
      fee: String(s.fee ?? 0),
      discount: String(s.discount ?? 0),
      exemption: String(s.exemption ?? 0),
      status: s.status,
      notes: s.notes ?? "",
    });
    setOpen(true);
  }

  return (
    <div className="space-y-4">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold">الطلاب</h1>
          <p className="text-sm text-muted-foreground">
            {students.length} طالب — إجمالي الاشتراكات {EGP(totals)}
          </p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(empty); }}>
          <DialogTrigger asChild>
            <Button className="shrink-0 gap-2">
              <Plus className="size-4" /> طالب جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{form.id ? "تعديل طالب" : "إضافة طالب"}</DialogTitle>
            </DialogHeader>
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
                    {Object.entries(STUDENT_STATUS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
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
              <p className="sm:col-span-2 rounded-lg bg-muted p-2 text-sm">
                المبلغ النهائي:{" "}
                <strong>
                  {EGP(Math.max(Number(form.fee) - Number(form.discount) - Number(form.exemption), 0))}
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
      </header>

      <Card>
        <CardContent className="flex flex-wrap gap-2 p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم أو الكود أو الهاتف"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="pe-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              {Object.entries(STUDENT_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المجموعات</SelectItem>
              {(lookups?.groups ?? []).map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={discountFilter} onValueChange={setDiscountFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات المالية</SelectItem>
              <SelectItem value="discount">عليهم خصم</SelectItem>
              <SelectItem value="exemption">عليهم إعفاء</SelectItem>
              <SelectItem value="either">خصم أو إعفاء</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الكود</TableHead>
                <TableHead>الاسم</TableHead>
                <TableHead>المجموعة</TableHead>
                <TableHead>السنة</TableHead>
                <TableHead>المبلغ النهائي</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">جارٍ التحميل...</TableCell></TableRow>
              )}
              {!isLoading && students.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">لا يوجد طلاب</TableCell></TableRow>
              )}
              {students.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell>#{s.code}</TableCell>
                  <TableCell className="font-medium">{s.full_name}</TableCell>
                  <TableCell>
                    {s.group_id ? (
                      <Link to="/groups/$groupId" params={{ groupId: s.group_id }} className="text-primary hover:underline">
                        {s.groups?.name}
                      </Link>
                    ) : "—"}
                  </TableCell>
                  <TableCell>{s.academic_years?.name ?? "—"}</TableCell>
                  <TableCell>{EGP(s.final_amount)}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === "active" ? "default" : "secondary"}>
                      {STUDENT_STATUS[s.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1">
                      {waLink(s.phone) && (
                        <Button asChild size="icon" variant="ghost">
                          <a href={waLink(s.phone)!} target="_blank" rel="noreferrer" aria-label="واتساب">
                            <MessageCircle className="size-4 text-success" />
                          </a>
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => edit(s)} aria-label="تعديل">
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => { setTarget(s); setPwd(""); }}
                        aria-label="حذف"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!target} onOpenChange={(o) => { if (!o) { setTarget(null); setPwd(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تأكيد حذف الطالب</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              سيتم حذف <strong className="text-foreground">{target?.full_name}</strong> وكل استحقاقاته ومدفوعاته وحضوره
              نهائياً. لا يمكن التراجع.
            </p>
            <F label="اكتب كلمة سر الحذف">
              <Input
                type="password"
                dir="ltr"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                placeholder="delete"
              />
            </F>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setTarget(null); setPwd(""); }}>إلغاء</Button>
            <Button
              variant="destructive"
              disabled={remove.isPending || pwd !== "delete"}
              onClick={() => target && remove.mutate({ id: target.id, password: pwd })}
            >
              {remove.isPending ? "جارٍ الحذف..." : "حذف نهائي"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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