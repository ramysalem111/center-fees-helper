import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ATTENDANCE_STATUS, dateAr, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/attendance")({
  head: () => ({
    meta: [
      { title: "الحضور | نظام إدارة السنتر" },
      { name: "description", content: "متابعة حضور وغياب الطلاب في كل الحصص حسب التاريخ." },
      { property: "og:title", content: "الحضور | نظام إدارة السنتر" },
      { property: "og:description", content: "سجل الحضور اليومي لكل المجموعات." },
    ],
  }),
  component: AttendancePage,
});

function AttendancePage() {
  const [date, setDate] = useState(todayISO());

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["attendance-day", date],
    queryFn: async () => {
      const { data: list } = await supabase
        .from("class_sessions")
        .select("id, session_number, session_date, group_id, groups(name)")
        .eq("session_date", date);
      const ids = (list ?? []).map((s) => s.id);
      if (!ids.length) return [];
      const { data: att } = await supabase.from("attendance").select("session_id, status").in("session_id", ids);
      return (list ?? []).map((s: any) => {
        const rows = (att ?? []).filter((a) => a.session_id === s.id);
        return {
          ...s,
          present: rows.filter((r) => r.status === "present").length,
          absent: rows.filter((r) => r.status === "absent").length,
          makeup: rows.filter((r) => r.status === "makeup").length,
        };
      });
    },
  });

  return (
    <div className="space-y-4">
      <header className="min-w-0">
        <h1 className="truncate text-2xl font-extrabold">الحضور والغياب</h1>
        <p className="text-sm text-muted-foreground">حصص يوم {dateAr(date)}</p>
      </header>

      <Card>
        <CardContent className="p-3">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المجموعة</TableHead>
                <TableHead>رقم الحصة</TableHead>
                <TableHead>{ATTENDANCE_STATUS.present}</TableHead>
                <TableHead>{ATTENDANCE_STATUS.absent}</TableHead>
                <TableHead>{ATTENDANCE_STATUS.makeup}</TableHead>
                <TableHead className="text-center">فتح</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">جارٍ التحميل...</TableCell></TableRow>}
              {!isLoading && sessions.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">لا توجد حصص في هذا اليوم</TableCell></TableRow>
              )}
              {sessions.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.groups?.name}</TableCell>
                  <TableCell>{s.session_number}</TableCell>
                  <TableCell><Badge className="bg-success text-success-foreground">{s.present}</Badge></TableCell>
                  <TableCell><Badge variant="destructive">{s.absent}</Badge></TableCell>
                  <TableCell><Badge variant="secondary">{s.makeup}</Badge></TableCell>
                  <TableCell className="text-center">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/groups/$groupId" params={{ groupId: s.group_id }}>شاشة المجموعة</Link>
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