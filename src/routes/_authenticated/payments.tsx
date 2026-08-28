import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BanIcon, MessageCircle, Pencil, Plus, RefreshCw, RotateCcw, Trash2, Wallet } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { ensureDueForMonth, generateMonthlyDues, monthAr, nearbyMonths, studentAmount } from "@/lib/dues";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DUE_STATUS, EGP, dateAr, todayISO, waLink } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({
    meta: [
      { title: "المدفوعات | نظام إدارة السنتر" },
      { name: "description", content: "تحصيل اشتراكات الطلاب ومتابعة المستحقات والمتأخرات." },
      { property: "og:title", content: "المدفوعات | نظام إدارة السنتر" },
      { property: "og:description", content: "تسجيل الدفعات وتوليد الاستحقاقات تلقائياً." },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("unpaid");
  const [groupId, setGroupId] = useState("all");
  const [payDue, setPayDue] = useState<any | null>(null);
  const [payPeriod, setPayPeriod] = useState("");
  const [amount, setAmount] = useState("");
  const [methodId, setMethodId] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [sumMonth, setSumMonth] = useState("all");

  const { data: lookups } = useQuery({
    queryKey: ["pay-lookups"],
    queryFn: async () => {
      const [groups, methods] = await Promise.all([
        supabase.from("groups").select("id, name, billing_system").order("name"),
        supabase.from("payment_methods").select("id, name").eq("status", "active"),
      ]);
      return { groups: groups.data ?? [], methods: methods.data ?? [] };
    },
  });

  const { data: dues = [], isLoading } = useQuery({
    queryKey: ["dues", status, groupId],
    queryFn: async () => {
      let q = supabase
        .from("dues")
        .select("*, students!inner(full_name, code, phone, guardian_phone, status, archived), groups(name)")
        .eq("students.status", "active")
        .eq("students.archived", false)
        .order("due_date", { ascending: false })
        .limit(500);
      if (status !== "all") q = q.eq("status", status as "unpaid" | "partial" | "paid" | "exempt");
      if (groupId !== "all") q = q.eq("group_id", groupId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  /** آخر دفعة لكل طالب: التاريخ استرشادي، والمهم شهر الاستحقاق المحصَّل */
  const { data: lastPaid = {} } = useQuery({
    queryKey: ["last-payments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("student_id, paid_at, dues(period_label)")
        .order("paid_at", { ascending: false })
        .limit(2000);
      const map: Record<string, { paid_at: string; period?: string | null }> = {};
      for (const p of (data ?? []) as any[]) {
        if (!map[p.student_id]) map[p.student_id] = { paid_at: p.paid_at, period: p.dues?.period_label ?? null };
      }
      return map;
    },
  });

  const genMonthly = useMutation({
    mutationFn: () => generateMonthlyDues(),
    onSuccess: (n) => {
      toast.success(n ? `تم توليد ${n} استحقاق` : "لا توجد استحقاقات جديدة");
      qc.invalidateQueries({ queryKey: ["dues"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** توليد استحقاقات الشهر تلقائياً عند فتح الشاشة حتى تظهر المستحقات من يوم 1 */
  const autoGen = useRef(false);
  useEffect(() => {
    if (autoGen.current) return;
    autoGen.current = true;
    generateMonthlyDues()
      .then((n) => { if (n) qc.invalidateQueries({ queryKey: ["dues"] }); })
      .catch(() => {});
  }, [qc]);

  /** استحقاقات الطالب المختار في نافذة التحصيل — للسماح بتحديد شهر الاستحقاق */
  const { data: payStudentDues = [] } = useQuery({
    queryKey: ["quick-pay-dues", payDue?.student_id],
    enabled: !!payDue?.student_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("dues")
        .select("*")
        .eq("student_id", payDue.student_id)
        .order("due_date", { ascending: false });
      return data ?? [];
    },
  });

  const pay = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!payDue || !value || value <= 0) throw new Error("أدخل مبلغاً صحيحاً");
      const label = payPeriod || payDue.period_label;
      const target = await ensureDueForMonth(payDue.student_id, payDue.group_id ?? null, label);
      if (target.status === "paid") throw new Error("هذا الشهر محصَّل بالكامل — اختر شهراً آخر");
      const { error } = await supabase.from("payments").insert({
        student_id: payDue.student_id,
        due_id: target.id,
        amount: value,
        payment_method_id: methodId || null,
        paid_at: todayISO(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تسجيل الدفعة");
      setPayDue(null);
      setAmount("");
      setPayPeriod("");
      qc.invalidateQueries({ queryKey: ["dues"] });
      qc.invalidateQueries({ queryKey: ["quick-pay-dues"] });
      qc.invalidateQueries({ queryKey: ["last-payments"] });
      qc.invalidateQueries({ queryKey: ["payments-log"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = dues
    .filter((d: any) => d.status !== "exempt")
    .reduce((s: number, d: any) => s + Number(d.amount) - Number(d.paid_amount), 0);

  const { data: groupSummary = [] } = useQuery({
    queryKey: ["dues", "group-summary", sumMonth],
    queryFn: async () => {
      let q = supabase
        .from("dues")
        .select("group_id, amount, paid_amount, status, groups(name), students!inner(status, archived)")
        .eq("students.status", "active")
        .eq("students.archived", false);
      if (sumMonth !== "all") q = q.eq("period_label", sumMonth);
      const { data } = await q;
      const map = new Map<string, { name: string; required: number; paid: number; remaining: number }>();
      for (const d of (data ?? []) as any[]) {
        const key = d.group_id ?? "none";
        const row = map.get(key) ?? { name: d.groups?.name ?? "بدون مجموعة", required: 0, paid: 0, remaining: 0 };
        const paid = Number(d.paid_amount ?? 0);
        row.paid += paid;
        if (d.status !== "exempt") {
          row.required += Number(d.amount ?? 0);
          row.remaining += Math.max(0, Number(d.amount ?? 0) - paid);
        }
        map.set(key, row);
      }
      return [...map.values()].sort((a, b) => b.remaining - a.remaining);
    },
  });
  const sumTotals = groupSummary.reduce(
    (a, r) => ({ required: a.required + r.required, paid: a.paid + r.paid, remaining: a.remaining + r.remaining }),
    { required: 0, paid: 0, remaining: 0 },
  );

  const toggleExempt = useMutation({
    mutationFn: async (due: any) => {
      const next = due.status === "exempt" ? "unpaid" : "exempt";
      const { error } = await supabase.from("dues").update({ status: next }).eq("id", due.id);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      toast.success(next === "exempt" ? "تم إعفاء الطالب من هذا الشهر" : "تم إلغاء الإعفاء");
      qc.invalidateQueries({ queryKey: ["dues"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold">المدفوعات والاستحقاقات</h1>
          <p className="text-sm text-muted-foreground">المتبقي في القائمة الحالية: {EGP(total)}</p>
        </div>
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild>
            <Button className="shrink-0 gap-2"><Plus className="size-4" /> دفع جديد</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader><DialogTitle>تسجيل دفعة جديدة</DialogTitle></DialogHeader>
            <NewPaymentForm
              groups={lookups?.groups ?? []}
              methods={lookups?.methods ?? []}
              onDone={() => setNewOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {Object.entries(DUE_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={groupId} onValueChange={setGroupId}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المجموعات</SelectItem>
              {(lookups?.groups ?? []).map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="gap-2"
            title="ينشئ استحقاقات الأشهر الناقصة للطلاب النشطين (حتى الشهر القادم للدفع المقدم) ويصحح قيمة أي استحقاق بصفر"
            onClick={() => genMonthly.mutate()}
            disabled={genMonthly.isPending}
          >
            <RefreshCw className="size-4" /> تحديث الاستحقاقات
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            زر «تحديث الاستحقاقات» ينشئ الاستحقاقات الشهرية الناقصة للطلاب النشطين حتى الشهر القادم (لتسجيل الدفع المقدم).
          </p>

        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 p-3">
            <span className="text-sm font-bold">ملخص كل مجموعة</span>
            <Select value={sumMonth} onValueChange={setSumMonth}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الشهور</SelectItem>
                {nearbyMonths().map((m) => <SelectItem key={m} value={m}>{monthAr(m)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المجموعة</TableHead>
                  <TableHead>المطلوب</TableHead>
                  <TableHead>المدفوع</TableHead>
                  <TableHead>المتبقي</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupSummary.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">لا توجد بيانات</TableCell></TableRow>
                )}
                {groupSummary.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{EGP(r.required)}</TableCell>
                    <TableCell className="text-success">{EGP(r.paid)}</TableCell>
                    <TableCell className={r.remaining > 0 ? "font-bold text-destructive" : "text-muted-foreground"}>{EGP(r.remaining)}</TableCell>
                  </TableRow>
                ))}
                {groupSummary.length > 0 && (
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell>الإجمالي</TableCell>
                    <TableCell>{EGP(sumTotals.required)}</TableCell>
                    <TableCell>{EGP(sumTotals.paid)}</TableCell>
                    <TableCell>{EGP(sumTotals.remaining)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الطالب</TableHead>
                <TableHead>المجموعة</TableHead>
                <TableHead>الفترة</TableHead>
                <TableHead>المطلوب</TableHead>
                <TableHead>المدفوع</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead>آخر دفع</TableHead>
                <TableHead className="text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">جارٍ التحميل...</TableCell></TableRow>}
              {!isLoading && dues.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">لا توجد استحقاقات</TableCell></TableRow>
              )}
              {dues.map((d: any) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.students?.full_name}</TableCell>
                  <TableCell>{d.groups?.name ?? "—"}</TableCell>
                  <TableCell>{monthAr(d.period_label)}</TableCell>
                  <TableCell>{EGP(d.amount)}</TableCell>
                  <TableCell>{EGP(d.paid_amount)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        d.status === "paid"
                          ? "default"
                          : d.status === "partial"
                            ? "secondary"
                            : d.status === "exempt"
                              ? "outline"
                              : "destructive"
                      }
                    >
                      {DUE_STATUS[d.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{dateAr(d.due_date)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {(() => {
                      const last = (lastPaid as Record<string, { paid_at: string; period?: string | null }>)[d.student_id];
                      if (!last) return "لم يدفع من قبل";
                      return (
                        <span className="text-xs">
                          {last.period ? `استحقاق ${monthAr(last.period)}` : "بدون استحقاق"}
                          <br />
                          <span className="opacity-70">بتاريخ {dateAr(last.paid_at)}</span>
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1">
                      <Button
                        size="sm"
                        className="gap-1"
                        disabled={d.status === "paid" || d.status === "exempt"}
                        onClick={() => {
                          setPayDue(d);
                          setPayPeriod(d.period_label);
                          setAmount(String(Number(d.amount) - Number(d.paid_amount)));
                        }}
                      >
                        <Wallet className="size-4" /> تحصيل
                      </Button>
                      {Number(d.paid_amount) <= 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          disabled={toggleExempt.isPending}
                          onClick={() => toggleExempt.mutate(d)}
                        >
                          {d.status === "exempt" ? (
                            <><RotateCcw className="size-4" /> إلغاء الإعفاء</>
                          ) : (
                            <><BanIcon className="size-4" /> إعفاء من الشهر</>
                          )}
                        </Button>
                      )}
                      {waLink(d.students?.guardian_phone ?? d.students?.phone) && (
                        <Button asChild size="icon" variant="ghost">
                          <a
                            href={
                              waLink(
                                d.students?.guardian_phone ?? d.students?.phone,
                                `تذكير: مستحق ${d.period_label} للطالب ${d.students?.full_name} بقيمة ${Number(d.amount) - Number(d.paid_amount)} جنيه.`,
                              )!
                            }
                            target="_blank"
                            rel="noreferrer"
                            aria-label="تذكير واتساب"
                          >
                            <MessageCircle className="size-4 text-success" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!payDue} onOpenChange={(o) => { if (!o) { setPayDue(null); setPayPeriod(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>تسجيل دفعة — {payDue?.students?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>شهر الاستحقاق</Label>
              <Select
                value={payPeriod || undefined}
                onValueChange={(v) => {
                  setPayPeriod(v);
                  const d = (payStudentDues as any[]).find((x) => x.period_label === v);
                  setAmount(d ? String(Number(d.amount) - Number(d.paid_amount)) : "");
                }}
              >
                <SelectTrigger><SelectValue placeholder="اختر الشهر" /></SelectTrigger>
                <SelectContent>
                  {nearbyMonths(payDue?.period_label).map((m) => {
                    const d = (payStudentDues as any[]).find((x) => x.period_label === m);
                    const label = d
                      ? d.status === "paid"
                        ? `${monthAr(m)} — مدفوع`
                        : `${monthAr(m)} — متبقي ${Number(d.amount) - Number(d.paid_amount)}`
                      : `${monthAr(m)} — بدون استحقاق`;
                    return <SelectItem key={m} value={m}>{label}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                كل دفعة تُسجَّل على شهر استحقاق محدد — يمكن تسجيل أكثر من دفعة في نفس اليوم لأشهر مختلفة.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>المبلغ</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>طريقة الدفع</Label>
              <Select value={methodId || undefined} onValueChange={setMethodId}>
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>
                  {(lookups?.methods ?? []).map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => pay.mutate()} disabled={pay.isPending}>حفظ الدفعة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PaymentsLog methods={lookups?.methods ?? []} />
    </div>
  );
}

/** سجل الدفعات مع تعديل/حذف أي دفعة خاطئة */
async function recomputeDue(dueId: string) {
  const { data: due } = await supabase.from("dues").select("id, amount, status").eq("id", dueId).maybeSingle();
  if (!due) return;
  const { data: rows } = await supabase.from("payments").select("amount").eq("due_id", dueId);
  const paid = (rows ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  const status =
    due.status === "exempt" ? "exempt" : paid <= 0 ? "unpaid" : paid >= Number(due.amount ?? 0) ? "paid" : "partial";
  await supabase.from("dues").update({ paid_amount: paid, status: status as any }).eq("id", dueId);
}

function PaymentsLog({ methods }: { methods: any[] }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<any | null>(null);
  const [del, setDel] = useState<any | null>(null);
  const [form, setForm] = useState({ amount: "", paid_at: "", methodId: "", notes: "", period: "" });

  const { data: editStudentDues = [] } = useQuery({
    queryKey: ["edit-student-dues", edit?.student_id],
    enabled: !!edit?.student_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("dues")
        .select("id, period_label, amount, paid_amount")
        .eq("student_id", edit.student_id)
        .order("period_label");
      return data ?? [];
    },
  });

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["payments-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, students(full_name, code, groups(name)), dues(period_label, groups(name)), payment_methods(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["payments-log"] });
    qc.invalidateQueries({ queryKey: ["dues"] });
    qc.invalidateQueries({ queryKey: ["last-payments"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const value = Number(form.amount);
      if (!value || value <= 0) throw new Error("أدخل مبلغاً صحيحاً");
      const oldDueId: string | null = edit.due_id ?? null;
      let dueId = oldDueId;
      if (form.period) {
        const target: any = await ensureDueForMonth(edit.student_id, edit.group_id ?? null, form.period);
        dueId = target.id;
      }
      const { error } = await supabase
        .from("payments")
        .update({
          amount: value,
          paid_at: form.paid_at,
          payment_method_id: form.methodId || null,
          notes: form.notes.trim() || null,
          due_id: dueId,
        })
        .eq("id", edit.id);
      if (error) throw error;
      // إعادة حساب حالة الاستحقاق القديم والجديد
      const ids = [oldDueId, dueId].filter((x, i, a) => x && a.indexOf(x) === i) as string[];
      for (const id of ids) await recomputeDue(id);
    },
    onSuccess: () => {
      toast.success("تم تعديل الدفعة");
      setEdit(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("payments").delete().eq("id", del.id);
      if (error) throw error;
      if (del.due_id) await recomputeDue(del.due_id);
    },
    onSuccess: () => {
      toast.success("تم حذف الدفعة");
      setDel(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="space-y-2 p-0">
        <div className="flex items-center justify-between gap-2 p-3 pb-0">
          <h2 className="text-base font-bold">سجل الدفعات</h2>
          <span className="text-xs text-muted-foreground">يمكن تعديل أو حذف أي دفعة خاطئة</span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الطالب</TableHead>
                <TableHead>المجموعة</TableHead>
                <TableHead>شهر الاستحقاق</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>تاريخ الدفع</TableHead>
                <TableHead>الطريقة</TableHead>
                <TableHead>ملاحظات</TableHead>
                <TableHead className="text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">جارٍ التحميل...</TableCell></TableRow>}
              {!isLoading && payments.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">لا توجد دفعات مسجَّلة</TableCell></TableRow>
              )}
              {payments.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.students?.full_name ?? "—"}</TableCell>
                  <TableCell>{p.dues?.groups?.name ?? p.students?.groups?.name ?? "—"}</TableCell>
                  <TableCell>{p.dues?.period_label ? monthAr(p.dues.period_label) : "بدون استحقاق"}</TableCell>
                  <TableCell>{EGP(p.amount)}</TableCell>
                  <TableCell>{dateAr(p.paid_at)}</TableCell>
                  <TableCell>{p.payment_methods?.name ?? "—"}</TableCell>
                  <TableCell className="max-w-40 truncate text-xs text-muted-foreground">{p.notes ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label="تعديل الدفعة"
                        onClick={() => {
                          setEdit(p);
                          setForm({
                            amount: String(p.amount ?? ""),
                            paid_at: p.paid_at ?? todayISO(),
                            methodId: p.payment_method_id ?? "",
                            notes: p.notes ?? "",
                            period: p.dues?.period_label ?? "",
                          });
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="حذف الدفعة" onClick={() => setDel(p)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!edit} onOpenChange={(o) => { if (!o) setEdit(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>تعديل دفعة — {edit?.students?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>شهر الاستحقاق</Label>
              <Select value={form.period || undefined} onValueChange={(v) => setForm({ ...form, period: v })}>
                <SelectTrigger><SelectValue placeholder="اختر الشهر" /></SelectTrigger>
                <SelectContent>
                  {Array.from(
                    new Set([...nearbyMonths(edit?.dues?.period_label), ...(form.period ? [form.period] : [])]),
                  )
                    .sort()
                    .map((m) => {
                      const d = (editStudentDues as any[]).find((x: any) => x.period_label === m);
                      const label = d
                        ? Number(d.paid_amount ?? 0) >= Number(d.amount ?? 0)
                          ? `${monthAr(m)} — مدفوع`
                          : `${monthAr(m)} — متبقي ${Number(d.amount) - Number(d.paid_amount)}`
                        : `${monthAr(m)} — بدون استحقاق`;
                      return <SelectItem key={m} value={m}>{label}</SelectItem>;
                    })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">تغيير الشهر ينقل الدفعة للاستحقاق الصحيح ويحدث حالة الشهرين تلقائياً</p>
            </div>
            <div className="space-y-1.5">
              <Label>المبلغ</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>تاريخ الدفع</Label>
              <Input type="date" value={form.paid_at} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>طريقة الدفع</Label>
              <Select value={form.methodId || undefined} onValueChange={(v) => setForm({ ...form, methodId: v })}>
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>
                  {methods.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>ملاحظات</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>حفظ التعديل</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!del} onOpenChange={(o) => { if (!o) setDel(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>حذف الدفعة</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            سيتم حذف دفعة {EGP(del?.amount ?? 0)} للطالب {del?.students?.full_name} وإرجاع حالة الشهر إلى غير مدفوع.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDel(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>تأكيد الحذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function NewPaymentForm({
  groups,
  methods,
  onDone,
}: {
  groups: any[];
  methods: any[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [groupId, setGroupId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [period, setPeriod] = useState(todayISO().slice(0, 7));
  const [amount, setAmount] = useState("");
  const [discount, setDiscount] = useState("0");
  const [fullExempt, setFullExempt] = useState(false);
  const [paidAt, setPaidAt] = useState(todayISO());
  const [methodId, setMethodId] = useState("");
  const [notes, setNotes] = useState("");

  const { data: students = [] } = useQuery({
    queryKey: ["pay-students", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, full_name, code, fee, discount, exemption, final_amount")
        .eq("group_id", groupId)
        .eq("status", "active")
        .eq("archived", false)
        .order("full_name");
      return data ?? [];
    },
  });

  const { data: studentDues = [] } = useQuery({
    queryKey: ["pay-student-dues", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data } = await supabase
        .from("dues")
        .select("*")
        .eq("student_id", studentId)
        .order("due_date", { ascending: false });
      return data ?? [];
    },
  });

  /** آخر دفعة للطالب */
  const { data: lastPayment } = useQuery({
    queryKey: ["pay-student-last", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("paid_at, amount")
        .eq("student_id", studentId)
        .order("paid_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const monthOptions = nearbyMonths();

  const selectedStudent = students.find((s: any) => s.id === studentId) as any;
  const selectedDue = studentDues.find((d: any) => d.period_label === period) as any;
  const alreadyPaid = selectedDue?.status === "paid";
  const base = selectedDue
    ? Number(selectedDue.amount) - Number(selectedDue.paid_amount)
    : studentAmount(selectedStudent);
  const net = fullExempt ? 0 : Math.max(base - Number(discount || 0), 0);

  const save = useMutation({
    mutationFn: async () => {
      if (!studentId) throw new Error("اختر الطالب");
      if (!period) throw new Error("اختر شهر الاستحقاق");
      if (alreadyPaid) throw new Error("تم تحصيل هذا الشهر بالكامل من قبل");

      // إعفاء كامل: لا يتم تحصيل أي مبلغ ويُعلَّم الشهر كـ"إعفاء"
      if (fullExempt) {
        const exemptDue = await ensureDueForMonth(studentId, groupId || null, period);
        const { error: exErr } = await supabase
          .from("dues")
          .update({ status: "exempt" })
          .eq("id", exemptDue.id);
        if (exErr) throw exErr;
        return;
      }

      const value = Number(amount || net);
      if (!value || value <= 0) throw new Error("أدخل مبلغاً صحيحاً");

      const due = await ensureDueForMonth(studentId, groupId || null, period);

      if (Number(discount) > 0) {
        const newAmount = Math.max(Number(due.amount) - Number(discount || 0), 0);
        const { error: dErr } = await supabase.from("dues").update({ amount: newAmount }).eq("id", due.id);
        if (dErr) throw dErr;
      }

      const extra = [
        Number(discount) > 0 ? `خصم ${discount}` : "",
        notes.trim(),
      ]
        .filter(Boolean)
        .join(" — ");

      const { error } = await supabase.from("payments").insert({
        student_id: studentId,
        due_id: due.id,
        amount: value,
        payment_method_id: methodId || null,
        paid_at: paidAt,
        notes: extra || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(fullExempt ? "تم إعفاء الطالب من هذا الشهر" : "تم تسجيل الدفعة");
      qc.invalidateQueries({ queryKey: ["dues"] });
      qc.invalidateQueries({ queryKey: ["last-payments"] });
      qc.invalidateQueries({ queryKey: ["payments-log"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>المجموعة</Label>
          <Select
            value={groupId || undefined}
            onValueChange={(v) => { setGroupId(v); setStudentId(""); setAmount(""); }}
          >
            <SelectTrigger><SelectValue placeholder="اختر المجموعة" /></SelectTrigger>
            <SelectContent>
              {groups.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>الطالب</Label>
          <Select
            value={studentId || undefined}
            onValueChange={(v) => { setStudentId(v); setAmount(""); }}
            disabled={!groupId}
          >
            <SelectTrigger><SelectValue placeholder={groupId ? "اختر الطالب" : "اختر المجموعة أولاً"} /></SelectTrigger>
            <SelectContent>
              {students.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>#{s.code} — {s.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {studentId && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label>شهر الاستحقاق</Label>
            <Select value={period} onValueChange={(v) => { setPeriod(v); setAmount(""); }}>
              <SelectTrigger><SelectValue placeholder="اختر الشهر" /></SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => {
                  const d = studentDues.find((x: any) => x.period_label === m) as any;
                  const label = d
                    ? d.status === "paid"
                      ? `${monthAr(m)} — مدفوع`
                      : `${monthAr(m)} — متبقي ${Number(d.amount) - Number(d.paid_amount)}`
                    : `${monthAr(m)} — بدون استحقاق`;
                  return <SelectItem key={m} value={m}>{label}</SelectItem>;
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              آخر دفعة: {lastPayment ? dateAr(lastPayment.paid_at) : "لا توجد دفعات سابقة"}
            </p>
            {alreadyPaid && (
              <p className="text-xs font-semibold text-destructive">تم تحصيل هذا الشهر بالفعل — اختر شهراً آخر.</p>
            )}
          </div>
        )}
        <div className="space-y-1.5">
          <Label>الخصم</Label>
          <Input
            type="number"
            value={discount}
            disabled={fullExempt}
            onChange={(e) => setDiscount(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">تخفيض جزئي من قيمة الشهر</p>
        </div>
        <div className="space-y-1.5 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <Label>إعفاء كامل من الشهر</Label>
            <Switch checked={fullExempt} onCheckedChange={setFullExempt} />
          </div>
          <p className="text-xs text-muted-foreground">
            لا يُحصَّل أي مبلغ ويُسجَّل الشهر كـ«إعفاء من الشهر»
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>المبلغ المدفوع</Label>
          <Input
            type="number"
            disabled={fullExempt}
            value={amount === "" ? String(net || "") : amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>تاريخ الدفع</Label>
          <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            تاريخ استرشادي فقط — الحساب يعتمد على شهر الاستحقاق (يمكن الدفع مقدماً أو متأخراً)
          </p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>طريقة الدفع</Label>
          <Select value={methodId || undefined} onValueChange={setMethodId}>
            <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
            <SelectContent>
              {methods.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>ملاحظات</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <p className="sm:col-span-2 rounded-lg bg-muted p-2 text-sm">
          {fullExempt ? "الطالب معفى من هذا الشهر — لن يُحصَّل أي مبلغ" : <>المطلوب بعد الخصم: <strong>{EGP(net)}</strong></>}
        </p>
      </div>
      <DialogFooter>
        <Button disabled={save.isPending || alreadyPaid} onClick={() => save.mutate()}>
          {fullExempt ? "حفظ الإعفاء" : "حفظ الدفعة"}
        </Button>
      </DialogFooter>
    </>
  );
}