import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, Printer } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DUE_STATUS, EGP, STUDENT_STATUS, dateAr, todayISO } from "@/lib/format";
import { exportCsv, printPage } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "التقارير | نظام إدارة السنتر" },
      { name: "description", content: "تقارير التحصيل والمصروفات والطلاب مع الطباعة والتصدير إلى Excel." },
      { property: "og:title", content: "التقارير | نظام إدارة السنتر" },
      { property: "og:description", content: "تقارير مالية وتشغيلية قابلة للطباعة والتصدير." },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const monthStart = todayISO().slice(0, 8) + "01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayISO());

  const { data } = useQuery({
    queryKey: ["reports", from, to],
    queryFn: async () => {
      const [payments, expenses, students, dues] = await Promise.all([
        supabase
          .from("payments")
          .select("id, amount, paid_at, students(full_name, code), payment_methods(name)")
          .gte("paid_at", from)
          .lte("paid_at", to)
          .order("paid_at", { ascending: false }),
        supabase
          .from("expenses")
          .select("id, amount, expense_date, notes, expense_types(name)")
          .gte("expense_date", from)
          .lte("expense_date", to)
          .order("expense_date", { ascending: false }),
        supabase.from("students").select("code, full_name, status, final_amount, groups(name)").eq("archived", false),
        supabase.from("dues").select("amount, paid_amount, status, period_label, students(full_name, code), groups(name)").neq("status", "paid"),
      ]);
      return {
        payments: payments.data ?? [],
        expenses: expenses.data ?? [],
        students: students.data ?? [],
        dues: dues.data ?? [],
      };
    },
  });

  const income = (data?.payments ?? []).reduce((s, p: any) => s + Number(p.amount), 0);
  const outcome = (data?.expenses ?? []).reduce((s, e: any) => s + Number(e.amount), 0);

  return (
    <div className="space-y-4">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold">التقارير</h1>
          <p className="text-sm text-muted-foreground">
            من {dateAr(from)} إلى {dateAr(to)} — الإيراد {EGP(income)} • المصروف {EGP(outcome)} • الصافي {EGP(income - outcome)}
          </p>
        </div>
        <Button variant="outline" className="no-print shrink-0 gap-2" onClick={printPage}>
          <Printer className="size-4" /> طباعة / PDF
        </Button>
      </header>

      <Card className="no-print">
        <CardContent className="flex flex-wrap items-end gap-3 p-3">
          <div className="space-y-1.5">
            <Label>من تاريخ</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
          </div>
          <div className="space-y-1.5">
            <Label>إلى تاريخ</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="payments">
        <TabsList className="no-print">
          <TabsTrigger value="payments">التحصيل</TabsTrigger>
          <TabsTrigger value="expenses">المصروفات</TabsTrigger>
          <TabsTrigger value="dues">المتأخرات</TabsTrigger>
          <TabsTrigger value="students">الطلاب</TabsTrigger>
        </TabsList>

        <TabsContent value="payments">
          <ReportTable
            title="تقرير التحصيل"
            headers={["الطالب", "الكود", "المبلغ", "طريقة الدفع", "التاريخ"]}
            rows={(data?.payments ?? []).map((p: any) => [
              p.students?.full_name ?? "—",
              `#${p.students?.code ?? ""}`,
              EGP(p.amount),
              p.payment_methods?.name ?? "—",
              dateAr(p.paid_at),
            ])}
            onExport={() =>
              exportCsv("تقرير-التحصيل", (data?.payments ?? []).map((p: any) => ({
                الطالب: p.students?.full_name ?? "",
                الكود: p.students?.code ?? "",
                المبلغ: Number(p.amount),
                طريقة_الدفع: p.payment_methods?.name ?? "",
                التاريخ: p.paid_at,
              })))
            }
          />
        </TabsContent>

        <TabsContent value="expenses">
          <ReportTable
            title="تقرير المصروفات"
            headers={["النوع", "المبلغ", "التاريخ", "ملاحظات"]}
            rows={(data?.expenses ?? []).map((e: any) => [
              e.expense_types?.name ?? "—",
              EGP(e.amount),
              dateAr(e.expense_date),
              e.notes ?? "—",
            ])}
            onExport={() =>
              exportCsv("تقرير-المصروفات", (data?.expenses ?? []).map((e: any) => ({
                النوع: e.expense_types?.name ?? "",
                المبلغ: Number(e.amount),
                التاريخ: e.expense_date,
                ملاحظات: e.notes ?? "",
              })))
            }
          />
        </TabsContent>

        <TabsContent value="dues">
          <ReportTable
            title="تقرير المتأخرات"
            headers={["الطالب", "المجموعة", "الفترة", "المطلوب", "المدفوع", "الحالة"]}
            rows={(data?.dues ?? []).map((d: any) => [
              d.students?.full_name ?? "—",
              d.groups?.name ?? "—",
              d.period_label,
              EGP(d.amount),
              EGP(d.paid_amount),
              DUE_STATUS[d.status],
            ])}
            onExport={() =>
              exportCsv("تقرير-المتأخرات", (data?.dues ?? []).map((d: any) => ({
                الطالب: d.students?.full_name ?? "",
                المجموعة: d.groups?.name ?? "",
                الفترة: d.period_label,
                المطلوب: Number(d.amount),
                المدفوع: Number(d.paid_amount),
                الحالة: DUE_STATUS[d.status],
              })))
            }
          />
        </TabsContent>

        <TabsContent value="students">
          <ReportTable
            title="تقرير الطلاب"
            headers={["الكود", "الاسم", "المجموعة", "الاشتراك", "الحالة"]}
            rows={(data?.students ?? []).map((s: any) => [
              `#${s.code}`,
              s.full_name,
              s.groups?.name ?? "—",
              EGP(s.final_amount),
              STUDENT_STATUS[s.status],
            ])}
            onExport={() =>
              exportCsv("تقرير-الطلاب", (data?.students ?? []).map((s: any) => ({
                الكود: s.code,
                الاسم: s.full_name,
                المجموعة: s.groups?.name ?? "",
                الاشتراك: Number(s.final_amount ?? 0),
                الحالة: STUDENT_STATUS[s.status],
              })))
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportTable({
  title,
  headers,
  rows,
  onExport,
}: {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  onExport: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button size="sm" variant="outline" className="no-print gap-2" onClick={onExport}>
          <FileDown className="size-4" /> Excel
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>{headers.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={headers.length} className="text-center text-muted-foreground">لا توجد بيانات</TableCell></TableRow>
            )}
            {rows.map((r, i) => (
              <TableRow key={i}>{r.map((c, j) => <TableCell key={j}>{c}</TableCell>)}</TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}