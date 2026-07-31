import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  UserCheck,
  UserX,
  Layers,
  CalendarCheck,
  CalendarX,
  AlertTriangle,
  Wallet,
  Receipt,
  TrendingUp,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EGP, dateAr, num, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة التحكم | نظام إدارة السنتر" },
      { name: "description", content: "نظرة عامة على الطلاب والمجموعات والحضور والتحصيل اليومي." },
      { property: "og:title", content: "لوحة التحكم | نظام إدارة السنتر" },
      { property: "og:description", content: "إحصائيات فورية للطلاب والمجموعات والإيرادات والمصروفات." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const today = todayISO();
      const monthStart = today.slice(0, 8) + "01";

      const count = (table: string, apply?: (q: any) => any) => {
        let q = supabase.from(table as never).select("*", { count: "exact", head: true });
        if (apply) q = apply(q);
        return q;
      };

      const [
        students,
        activeStudents,
        suspended,
        groups,
        openGroups,
        finishedGroups,
        sessionsToday,
        unpaidDues,
        payments,
        expenses,
        recentStudents,
        recentPayments,
      ] = await Promise.all([
        count("students"),
        count("students", (q) => q.eq("status", "active")),
        count("students", (q) => q.eq("status", "suspended")),
        count("groups"),
        count("groups", (q) => q.eq("status", "open")),
        count("groups", (q) => q.eq("status", "finished")),
        supabase.from("class_sessions").select("id").eq("session_date", today),
        supabase.from("dues").select("id, student_id, amount, paid_amount, period_label, students(full_name, phone)").neq("status", "paid").limit(50),
        supabase.from("payments").select("amount").gte("paid_at", monthStart),
        supabase.from("expenses").select("amount").gte("expense_date", monthStart),
        supabase.from("students").select("id, code, full_name, created_at").order("created_at", { ascending: false }).limit(5),
        supabase.from("payments").select("id, amount, paid_at, students(full_name), dues(period_label)").order("created_at", { ascending: false }).limit(5),
      ]);

      const sessionIds = (sessionsToday.data ?? []).map((s: { id: string }) => s.id);
      let present = 0;
      let absent = 0;
      if (sessionIds.length) {
        const { data: att } = await supabase
          .from("attendance")
          .select("status")
          .in("session_id", sessionIds);
        present = (att ?? []).filter((a) => a.status !== "absent").length;
        absent = (att ?? []).filter((a) => a.status === "absent").length;
      }

      const income = (payments.data ?? []).reduce((s, p) => s + Number(p.amount), 0);
      const outcome = (expenses.data ?? []).reduce((s, p) => s + Number(p.amount), 0);

      return {
        students: students.count ?? 0,
        activeStudents: activeStudents.count ?? 0,
        suspended: suspended.count ?? 0,
        groups: groups.count ?? 0,
        openGroups: openGroups.count ?? 0,
        finishedGroups: finishedGroups.count ?? 0,
        present,
        absent,
        income,
        outcome,
        unpaid: unpaidDues.data ?? [],
        recentStudents: recentStudents.data ?? [],
        recentPayments: recentPayments.data ?? [],
      };
    },
  });

  if (isLoading || !data) {
    return <p className="text-muted-foreground">جارٍ تحميل الإحصائيات...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">لوحة التحكم</h1>
        <p className="text-sm text-muted-foreground">نظرة سريعة على أداء السنتر اليوم وهذا الشهر</p>
      </div>

      {data.unpaid.length > 0 && (
        <Card className="border-warning/40 bg-warning/10">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <AlertTriangle className="size-5 text-warning-foreground" />
            <p className="text-sm font-medium">
              يوجد {num(data.unpaid.length)} طالب لديهم مستحقات غير مسددة
            </p>
            <Button asChild size="sm" variant="outline" className="ms-auto">
              <Link to="/payments">فتح قائمة المتأخرين</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="إجمالي الطلاب" value={num(data.students)} icon={Users} />
        <StatCard label="الطلاب النشطون" value={num(data.activeStudents)} icon={UserCheck} tone="success" />
        <StatCard label="الطلاب الموقوفون" value={num(data.suspended)} icon={UserX} tone="danger" />
        <StatCard label="إجمالي المجموعات" value={num(data.groups)} icon={Layers} />
        <StatCard label="المجموعات المفتوحة" value={num(data.openGroups)} icon={Layers} tone="success" />
        <StatCard label="المجموعات المنتهية" value={num(data.finishedGroups)} icon={Layers} tone="warning" />
        <StatCard label="حضور اليوم" value={num(data.present)} icon={CalendarCheck} tone="success" />
        <StatCard label="غياب اليوم" value={num(data.absent)} icon={CalendarX} tone="danger" />
        <StatCard label="تحصيل الشهر" value={EGP(data.income)} icon={Wallet} tone="success" />
        <StatCard label="مصروفات الشهر" value={EGP(data.outcome)} icon={Receipt} tone="warning" />
        <StatCard
          label="صافي الإيراد"
          value={EGP(data.income - data.outcome)}
          icon={TrendingUp}
          tone={data.income - data.outcome >= 0 ? "success" : "danger"}
        />
        <StatCard label="لم يدفعوا" value={num(data.unpaid.length)} icon={AlertTriangle} tone="danger" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">آخر الطلاب المسجلين</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentStudents.length === 0 && <p className="text-sm text-muted-foreground">لا يوجد طلاب بعد</p>}
            {data.recentStudents.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                <span className="truncate font-medium">{s.full_name}</span>
                <Badge variant="secondary">#{s.code}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">آخر عمليات الدفع</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentPayments.length === 0 && <p className="text-sm text-muted-foreground">لا توجد مدفوعات بعد</p>}
            {data.recentPayments.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                <span className="truncate font-medium">{p.students?.full_name ?? "—"}</span>
                <span className="text-xs text-muted-foreground">
                  {p.dues?.period_label ? `استحقاق ${monthAr(p.dues.period_label)}` : "بدون استحقاق"} • {dateAr(p.paid_at)}
                </span>
                <Badge className="bg-success text-success-foreground">{EGP(p.amount)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}