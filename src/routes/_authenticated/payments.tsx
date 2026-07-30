import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle, Plus, RefreshCw, Wallet } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { generateMonthlyDues, generateSessionDues } from "@/lib/dues";
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
      if (status !== "all") q = q.eq("status", status as "unpaid" | "partial" | "paid");
      if (groupId !== "all") q = q.eq("group_id", groupId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
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
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = dues.reduce((s: number, d: any) => s + Number(d.amount) - Number(d.paid_amount), 0);

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
                <TableHead className="text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">جارٍ التحميل...</TableCell></TableRow>}
              {!isLoading && dues.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">لا توجد استحقاقات</TableCell></TableRow>
              )}
              {dues.map((d: any) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.students?.full_name}</TableCell>
                  <TableCell>{d.groups?.name ?? "—"}</TableCell>
                  <TableCell>{d.period_label}</TableCell>
                  <TableCell>{EGP(d.amount)}</TableCell>
                  <TableCell>{EGP(d.paid_amount)}</TableCell>
                  <TableCell>
                    <Badge variant={d.status === "paid" ? "default" : d.status === "partial" ? "secondary" : "destructive"}>
                      {DUE_STATUS[d.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{dateAr(d.due_date)}</TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1">
                      <Button
                        size="sm"
                        className="gap-1"
                        disabled={d.status === "paid"}
                        onClick={() => {
                          setPayDue(d);
                          setAmount(String(Number(d.amount) - Number(d.paid_amount)));
                        }}
                      >
                        <Wallet className="size-4" /> تحصيل
                      </Button>
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