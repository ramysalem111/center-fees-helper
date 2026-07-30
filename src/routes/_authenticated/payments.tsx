import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BanIcon, MessageCircle, Plus, RefreshCw, RotateCcw, Wallet } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { ensureDueForMonth, generateMonthlyDues, generateSessionDues, monthAr } from "@/lib/dues";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [amount, setAmount] = useState("");
  const [methodId, setMethodId] = useState("");
  const [cycleGroup, setCycleGroup] = useState("");
  const [newOpen, setNewOpen] = useState(false);

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
        .select("*, students(full_name, code, phone, guardian_phone), groups(name)")
        .order("due_date", { ascending: false })
        .limit(500);
      if (status !== "all") q = q.eq("status", status as "unpaid" | "partial" | "paid" | "exempt");
      if (groupId !== "all") q = q.eq("group_id", groupId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  /** آخر تاريخ دفع لكل طالب — يظهر مع حالات عدم الدفع */
  const { data: lastPaid = {} } = useQuery({
    queryKey: ["last-payments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("student_id, paid_at")
        .order("paid_at", { ascending: false })
        .limit(2000);
      const map: Record<string, string> = {};
      for (const p of data ?? []) if (!map[p.student_id]) map[p.student_id] = p.paid_at;
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

  const genCycle = useMutation({
    mutationFn: () => generateSessionDues(cycleGroup),
    onSuccess: (n) => {
      toast.success(n ? `تم توليد ${n} استحقاق للدورة` : "لا توجد استحقاقات جديدة");
      qc.invalidateQueries({ queryKey: ["dues"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pay = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!payDue || !value || value <= 0) throw new Error("أدخل مبلغاً صحيحاً");
      const { error } = await supabase.from("payments").insert({
        student_id: payDue.student_id,
        due_id: payDue.id,
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
      qc.invalidateQueries({ queryKey: ["dues"] });
      qc.invalidateQueries({ queryKey: ["last-payments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = dues.reduce((s: number, d: any) => s + Number(d.amount) - Number(d.paid_amount), 0);

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
          <Button variant="outline" className="gap-2" onClick={() => genMonthly.mutate()} disabled={genMonthly.isPending}>
            <RefreshCw className="size-4" /> توليد استحقاقات الشهر
          </Button>
          <div className="flex items-center gap-2">
            <Select value={cycleGroup || undefined} onValueChange={setCycleGroup}>
              <SelectTrigger className="w-48"><SelectValue placeholder="مجموعة نظام 8 حصص" /></SelectTrigger>
              <SelectContent>
                {(lookups?.groups ?? [])
                  .filter((g: any) => g.billing_system === "per_8_sessions")
                  .map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" disabled={!cycleGroup || genCycle.isPending} onClick={() => genCycle.mutate()}>
              توليد دورة
            </Button>
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
                  <TableCell>{d.period_label}</TableCell>
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
                    {d.status === "paid"
                      ? "—"
                      : (lastPaid as Record<string, string>)[d.student_id]
                        ? dateAr((lastPaid as Record<string, string>)[d.student_id])
                        : "لم يدفع من قبل"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1">
                      <Button
                        size="sm"
                        className="gap-1"
                        disabled={d.status === "paid" || d.status === "exempt"}
                        onClick={() => {
                          setPayDue(d);
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

      <Dialog open={!!payDue} onOpenChange={(o) => !o && setPayDue(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>تسجيل دفعة — {payDue?.students?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
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
    </div>
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
  const [exemption, setExemption] = useState("0");
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

  const monthOptions = (() => {
    const out: string[] = [];
    const now = new Date();
    for (let i = -1; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  })();

  const selectedStudent = students.find((s: any) => s.id === studentId) as any;
  const selectedDue = studentDues.find((d: any) => d.period_label === period) as any;
  const alreadyPaid = selectedDue?.status === "paid";
  const base = selectedDue
    ? Number(selectedDue.amount) - Number(selectedDue.paid_amount)
    : Number(selectedStudent?.final_amount ?? 0);
  const net = Math.max(base - Number(discount || 0) - Number(exemption || 0), 0);

  const save = useMutation({
    mutationFn: async () => {
      if (!studentId) throw new Error("اختر الطالب");
      if (!period) throw new Error("اختر شهر الاستحقاق");
      if (alreadyPaid) throw new Error("تم تحصيل هذا الشهر بالكامل من قبل");
      const value = Number(amount || net);
      if (!value || value <= 0) throw new Error("أدخل مبلغاً صحيحاً");

      const due = await ensureDueForMonth(studentId, groupId || null, period);

      if (Number(discount) > 0 || Number(exemption) > 0) {
        const newAmount = Math.max(
          Number(due.amount) - Number(discount || 0) - Number(exemption || 0),
          0,
        );
        const { error: dErr } = await supabase.from("dues").update({ amount: newAmount }).eq("id", due.id);
        if (dErr) throw dErr;
      }

      const extra = [
        Number(discount) > 0 ? `خصم ${discount}` : "",
        Number(exemption) > 0 ? `إعفاء ${exemption}` : "",
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
      toast.success("تم تسجيل الدفعة");
      qc.invalidateQueries({ queryKey: ["dues"] });
      qc.invalidateQueries({ queryKey: ["last-payments"] });
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
          <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>الإعفاء</Label>
          <Input type="number" value={exemption} onChange={(e) => setExemption(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>المبلغ المدفوع</Label>
          <Input
            type="number"
            value={amount === "" ? String(net || "") : amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>تاريخ الدفع</Label>
          <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
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
          المطلوب بعد الخصم والإعفاء: <strong>{EGP(net)}</strong>
        </p>
      </div>
      <DialogFooter>
        <Button disabled={save.isPending || alreadyPaid} onClick={() => save.mutate()}>حفظ الدفعة</Button>
      </DialogFooter>
    </>
  );
}