import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EGP, dateAr, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/other-income")({
  head: () => ({
    meta: [
      { title: "إيرادات أخرى | نظام إدارة السنتر" },
      { name: "description", content: "تسجيل الإيرادات الأخرى للسنتر مثل الكتب والملازم والاشتراكات." },
      { property: "og:title", content: "إيرادات أخرى | نظام إدارة السنتر" },
      { property: "og:description", content: "متابعة بنود الإيراد خارج مدفوعات الطلاب." },
    ],
  }),
  component: OtherIncomePage,
});

function OtherIncomePage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    amount: "",
    income_type_id: "",
    payment_method_id: "",
    income_date: todayISO(),
    notes: "",
  });

  const { data: lookups } = useQuery({
    queryKey: ["income-lookups"],
    queryFn: async () => {
      const [types, methods] = await Promise.all([
        supabase.from("income_types").select("id, name").eq("status", "active"),
        supabase.from("payment_methods").select("id, name").eq("status", "active"),
      ]);
      return { types: types.data ?? [], methods: methods.data ?? [] };
    },
  });

  const { data: rows = [] } = useQuery({
    queryKey: ["other-incomes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("other_incomes")
        .select("*, income_types(name), payment_methods(name)")
        .order("income_date", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const value = Number(form.amount);
      if (!value || value <= 0) throw new Error("أدخل مبلغاً صحيحاً");
      const { error } = await supabase.from("other_incomes").insert({
        amount: value,
        income_type_id: form.income_type_id || null,
        payment_method_id: form.payment_method_id || null,
        income_date: form.income_date,
        notes: form.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تسجيل الإيراد");
      setOpen(false);
      setForm({ amount: "", income_type_id: "", payment_method_id: "", income_date: todayISO(), notes: "" });
      qc.invalidateQueries({ queryKey: ["other-incomes"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("other_incomes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["other-incomes"] });
    },
    onError: () => toast.error("الحذف متاح للمدير فقط"),
  });

  const total = rows.reduce((s: number, r: any) => s + Number(r.amount), 0);

  return (
    <div className="space-y-4">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold">إيرادات أخرى</h1>
          <p className="text-sm text-muted-foreground">الإجمالي المعروض: {EGP(total)}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="shrink-0 gap-2"><Plus className="size-4" /> إيراد جديد</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>تسجيل إيراد</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label>المبلغ</Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>نوع الإيراد</Label>
                <Select value={form.income_type_id || undefined} onValueChange={(v) => setForm({ ...form, income_type_id: v })}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    {(lookups?.types ?? []).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>طريقة الدفع</Label>
                <Select value={form.payment_method_id || undefined} onValueChange={(v) => setForm({ ...form, payment_method_id: v })}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    {(lookups?.methods ?? []).map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>التاريخ</Label>
                <Input type="date" value={form.income_date} onChange={(e) => setForm({ ...form, income_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>ملاحظات</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>التاريخ</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>طريقة الدفع</TableHead>
                <TableHead>ملاحظات</TableHead>
                <TableHead className="text-center">حذف</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">لا توجد إيرادات مسجلة</TableCell>
                </TableRow>
              )}
              {rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{dateAr(r.income_date)}</TableCell>
                  <TableCell>{r.income_types?.name ?? "—"}</TableCell>
                  <TableCell className="font-semibold">{EGP(r.amount)}</TableCell>
                  <TableCell>{r.payment_methods?.name ?? "—"}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{r.notes ?? "—"}</TableCell>
                  <TableCell className="text-center">
                    <Button size="icon" variant="ghost" aria-label="حذف الإيراد" onClick={() => remove.mutate(r.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}