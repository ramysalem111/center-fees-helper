import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarX, MessageCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EGP, dateAr, todayISO, waLink } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "الإشعارات | نظام إدارة السنتر" },
      { name: "description", content: "تنبيهات المتأخرات والغياب مع إرسال تذكير واتساب لولي الأمر." },
      { property: "og:title", content: "الإشعارات | نظام إدارة السنتر" },
      { property: "og:description", content: "تنبيهات فورية للمتأخرات وحالات الغياب." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const today = todayISO();
      const { data: dues } = await supabase
        .from("dues")
        .select("id, amount, paid_amount, period_label, due_date, students(full_name, phone, guardian_phone), groups(name)")
        .neq("status", "paid")
        .lte("due_date", today)
        .order("due_date")
        .limit(100);

      const { data: sessions } = await supabase
        .from("class_sessions")
        .select("id")
        .gte("session_date", new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10));
      const ids = (sessions ?? []).map((s) => s.id);
      let absents: any[] = [];
      if (ids.length) {
        const { data: att } = await supabase
          .from("attendance")
          .select("id, created_at, status, students(full_name, phone, guardian_phone), class_sessions(session_date, groups(name))")
          .eq("status", "absent")
          .in("session_id", ids)
          .limit(100);
        absents = att ?? [];
      }
      return { dues: dues ?? [], absents };
    },
  });

  return (
    <div className="space-y-4">
      <header className="min-w-0">
        <h1 className="truncate text-2xl font-extrabold">الإشعارات</h1>
        <p className="text-sm text-muted-foreground">تنبيهات المتأخرات والغياب خلال آخر أسبوع</p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-destructive" /> مستحقات متأخرة ({data?.dues.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.dues ?? []).length === 0 && <p className="text-sm text-muted-foreground">لا توجد متأخرات</p>}
          {(data?.dues ?? []).map((d: any) => {
            const rest = Number(d.amount) - Number(d.paid_amount);
            const link = waLink(
              d.students?.guardian_phone ?? d.students?.phone,
              `تذكير من السنتر: مستحق ${d.period_label} للطالب ${d.students?.full_name} بقيمة ${rest} جنيه.`,
            );
            return (
              <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
                <span className="font-medium">{d.students?.full_name}</span>
                <Badge variant="outline">{d.groups?.name ?? "—"}</Badge>
                <Badge variant="destructive">{EGP(rest)}</Badge>
                <span className="text-xs text-muted-foreground">{dateAr(d.due_date)}</span>
                {link && (
                  <Button asChild size="sm" variant="outline" className="ms-auto gap-1">
                    <a href={link} target="_blank" rel="noreferrer">
                      <MessageCircle className="size-4 text-success" /> تذكير
                    </a>
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarX className="size-4 text-warning-foreground" /> حالات غياب ({data?.absents.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.absents ?? []).length === 0 && <p className="text-sm text-muted-foreground">لا يوجد غياب</p>}
          {(data?.absents ?? []).map((a: any) => {
            const link = waLink(
              a.students?.guardian_phone ?? a.students?.phone,
              `تنبيه: الطالب ${a.students?.full_name} تغيّب عن حصة ${dateAr(a.class_sessions?.session_date)}.`,
            );
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
                <span className="font-medium">{a.students?.full_name}</span>
                <Badge variant="outline">{a.class_sessions?.groups?.name ?? "—"}</Badge>
                <span className="text-xs text-muted-foreground">{dateAr(a.class_sessions?.session_date)}</span>
                {link && (
                  <Button asChild size="sm" variant="outline" className="ms-auto gap-1">
                    <a href={link} target="_blank" rel="noreferrer">
                      <MessageCircle className="size-4 text-success" /> إبلاغ ولي الأمر
                    </a>
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}