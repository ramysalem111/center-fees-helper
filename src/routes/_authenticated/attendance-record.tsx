import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Clock, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ATTENDANCE_STATUS, dateAr, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/attendance-record")({
  head: () => ({
    meta: [
      { title: "تسجيل حضور الطلاب | نظام إدارة السنتر" },
      { name: "description", content: "تحديد حالة حضور كل طالب وتاريخ الحصة بسهولة من شاشة واحدة." },
      { property: "og:title", content: "تسجيل حضور الطلاب | نظام إدارة السنتر" },
      { property: "og:description", content: "اختر المجموعة والتاريخ وحدد حالة حضور كل طالب." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AttendanceRecordPage,
});

type Status = "present" | "absent" | "makeup";

function AttendanceRecordPage() {
  const qc = useQueryClient();
  const [groupId, setGroupId] = useState("");
  const [date, setDate] = useState(todayISO());

  const { data: groups = [] } = useQuery({
    queryKey: ["att-groups"],
    queryFn: async () => {
      const { data } = await supabase.from("groups").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: session } = useQuery({
    queryKey: ["att-session", groupId, date],
    enabled: !!groupId && !!date,
    queryFn: async () => {
      const { data } = await supabase
        .from("class_sessions")
        .select("*")
        .eq("group_id", groupId)
        .eq("session_date", date)
        .maybeSingle();
      return data;
    },
  });

  const { data: students = [] } = useQuery({
    queryKey: ["att-students", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, code, full_name")
        .eq("group_id", groupId)
        .eq("archived", false)
        .order("full_name");
      return data ?? [];
    },
  });

  const { data: marks = {} } = useQuery({
    queryKey: ["att-marks", session?.id],
    enabled: !!session?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance")
        .select("student_id, status")
        .eq("session_id", session!.id);
      return Object.fromEntries((data ?? []).map((a) => [a.student_id, a.status]));
    },
  });

  async function ensureSession() {
    if (session?.id) return session.id as string;
    const { count } = await supabase
      .from("class_sessions")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId);
    const { data, error } = await supabase
      .from("class_sessions")
      .insert({ group_id: groupId, session_date: date, session_number: (count ?? 0) + 1 })
      .select("id")
      .single();
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["att-session", groupId, date] });
    return data.id as string;
  }

  const mark = useMutation({
    mutationFn: async ({ studentId, status }: { studentId: string; status: Status }) => {
      if (!groupId) throw new Error("اختر المجموعة أولاً");
      const sid = await ensureSession();
      const { error } = await supabase
        .from("attendance")
        .upsert({ session_id: sid, student_id: studentId, status }, { onConflict: "session_id,student_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["att-marks"] });
      qc.invalidateQueries({ queryKey: ["attendance-day"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markAll = useMutation({
    mutationFn: async (status: Status) => {
      if (!groupId) throw new Error("اختر المجموعة أولاً");
      const sid = await ensureSession();
      const rows = students.map((s: any) => ({ session_id: sid, student_id: s.id, status }));
      if (!rows.length) return;
      const { error } = await supabase.from("attendance").upsert(rows, { onConflict: "session_id,student_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تسجيل الحضور للجميع");
      qc.invalidateQueries({ queryKey: ["att-marks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const current = marks as Record<string, string>;
  const counted = students.filter((s: any) => current[s.id]).length;

  return (
    <div className="space-y-4">
      <header className="min-w-0">
        <h1 className="truncate text-2xl font-extrabold">تسجيل حضور الطلاب</h1>
        <p className="text-sm text-muted-foreground">حدد المجموعة والتاريخ ثم حالة حضور كل طالب — {dateAr(date)}</p>
      </header>

      <Card>
        <CardContent className="grid gap-3 p-3 sm:grid-cols-[1fr_auto_auto]">
          <div className="space-y-1.5">
            <Label>المجموعة</Label>
            <Select value={groupId || undefined} onValueChange={setGroupId}>
              <SelectTrigger><SelectValue placeholder="اختر المجموعة" /></SelectTrigger>
              <SelectContent>
                {groups.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>تاريخ الحصة</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" disabled={!groupId || markAll.isPending} onClick={() => markAll.mutate("present")}>
              تحضير الكل
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الكود</TableHead>
                <TableHead>اسم الطالب</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-center">تحديد الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!groupId && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">اختر المجموعة لعرض الطلاب</TableCell></TableRow>
              )}
              {groupId && students.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">لا يوجد طلاب في هذه المجموعة</TableCell></TableRow>
              )}
              {students.map((s: any) => {
                const st = current[s.id];
                return (
                  <TableRow key={s.id}>
                    <TableCell>#{s.code}</TableCell>
                    <TableCell className="font-medium">{s.full_name}</TableCell>
                    <TableCell>
                      {st ? (
                        <Badge variant={st === "present" ? "default" : st === "absent" ? "destructive" : "secondary"}>
                          {ATTENDANCE_STATUS[st]}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">لم يُسجَّل</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center gap-1">
                        <Button size="icon" variant={st === "present" ? "default" : "outline"} aria-label={ATTENDANCE_STATUS.present}
                          onClick={() => mark.mutate({ studentId: s.id, status: "present" })}>
                          <Check className="size-4" />
                        </Button>
                        <Button size="icon" variant={st === "absent" ? "destructive" : "outline"} aria-label={ATTENDANCE_STATUS.absent}
                          onClick={() => mark.mutate({ studentId: s.id, status: "absent" })}>
                          <X className="size-4" />
                        </Button>
                        <Button size="icon" variant={st === "makeup" ? "secondary" : "outline"} aria-label={ATTENDANCE_STATUS.makeup}
                          onClick={() => mark.mutate({ studentId: s.id, status: "makeup" })}>
                          <Clock className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {groupId && (
        <p className="text-sm text-muted-foreground">تم تسجيل {counted} من {students.length} طالب في هذا التاريخ.</p>
      )}
    </div>
  );
}