import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, Check, Clock, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ATTENDANCE_STATUS, BILLING_SYSTEM, DUE_STATUS, EGP, dateAr, todayISO } from "@/lib/format";
import { monthAr } from "@/lib/dues";

export const Route = createFileRoute("/_authenticated/groups/$groupId")({
  head: () => ({
    meta: [
      { title: "شاشة المجموعة | نظام إدارة السنتر" },
      { name: "description", content: "تسجيل الحضور والغياب ومتابعة مستحقات طلاب المجموعة." },
      { property: "og:title", content: "شاشة المجموعة | نظام إدارة السنتر" },
      { property: "og:description", content: "حضور وغياب المجموعة وحالة الدفع لكل طالب." },
    ],
  }),
  component: GroupScreen,
});

function GroupScreen() {
  const { groupId } = Route.useParams();
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState<string>("");

  const { data: group } = useQuery({
    queryKey: ["group", groupId],
    queryFn: async () => {
      const { data } = await supabase
        .from("groups")
        .select("*, academic_years(name), locations(name)")
        .eq("id", groupId)
        .maybeSingle();
      return data;
    },
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions", groupId],
    queryFn: async () => {
      const { data } = await supabase
        .from("class_sessions")
        .select("*")
        .eq("group_id", groupId)
        .order("session_date", { ascending: false });
      const list = data ?? [];
      if (list.length && !sessionId) setSessionId(list[0].id);
      return list;
    },
  });

  const { data: students = [] } = useQuery({
    queryKey: ["group-students", groupId],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, code, full_name, status, final_amount")
        .eq("group_id", groupId)
        .eq("archived", false)
        .order("full_name");
      return data ?? [];
    },
  });

  const { data: attendance = {} } = useQuery({
    queryKey: ["attendance", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data } = await supabase.from("attendance").select("student_id, status").eq("session_id", sessionId);
      return Object.fromEntries((data ?? []).map((a) => [a.student_id, a.status]));
    },
  });

  const { data: dues = [] } = useQuery({
    queryKey: ["group-dues", groupId],
    queryFn: async () => {
      const { data } = await supabase
        .from("dues")
        .select("*")
        .eq("group_id", groupId)
        .order("due_date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: lastPaid = {} } = useQuery({
    queryKey: ["group-last-payments", groupId],
    queryFn: async () => {
      const ids = students.map((s: any) => s.id);
      if (!ids.length) return {};
      const { data } = await supabase
        .from("payments")
        .select("student_id, paid_at")
        .in("student_id", ids)
        .order("paid_at", { ascending: false });
      const map: Record<string, string> = {};
      for (const p of data ?? []) if (!map[p.student_id]) map[p.student_id] = p.paid_at;
      return map;
    },
  });

  const addSession = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("class_sessions")
        .insert({ group_id: groupId, session_date: todayISO(), session_number: sessions.length + 1 })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      setSessionId(id);
      toast.success("تم إنشاء حصة اليوم");
      qc.invalidateQueries({ queryKey: ["sessions", groupId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mark = useMutation({
    mutationFn: async ({ studentId, status }: { studentId: string; status: "present" | "absent" | "makeup" }) => {
      if (!sessionId) throw new Error("أنشئ حصة أولاً");
      const { error } = await supabase
        .from("attendance")
        .upsert({ session_id: sessionId, student_id: studentId, status }, { onConflict: "session_id,student_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance", sessionId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const dueByStudent = new Map<string, any>();
  for (const d of dues as any[]) if (!dueByStudent.has(d.student_id)) dueByStudent.set(d.student_id, d);

  return (
    <div className="space-y-4">
      <header className="min-w-0">
        <h1 className="truncate text-2xl font-extrabold">{group?.name ?? "المجموعة"}</h1>
        <p className="text-sm text-muted-foreground">
          {group
            ? `${BILLING_SYSTEM[group.billing_system]} • ${EGP(group.fee)} • ${(group.study_days ?? []).join("، ")}${group.is_active && group.activated_at ? ` • مُفعَّلة من ${monthAr(group.activated_at)}` : ""}`
            : ""}
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <Select value={sessionId || undefined} onValueChange={setSessionId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="اختر الحصة" /></SelectTrigger>
            <SelectContent>
              {sessions.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>
                  حصة {s.session_number} — {dateAr(s.session_date)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="gap-2" onClick={() => addSession.mutate()} disabled={addSession.isPending}>
            <CalendarPlus className="size-4" /> حصة اليوم
          </Button>
          <Badge variant="secondary" className="ms-auto">{students.length} طالب</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">الحضور والغياب</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الكود</TableHead>
                <TableHead>الاسم</TableHead>
                <TableHead>الاشتراك</TableHead>
                <TableHead>حالة الدفع</TableHead>
                <TableHead className="text-center">التسجيل</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">لا يوجد طلاب في هذه المجموعة</TableCell></TableRow>
              )}
              {students.map((s: any) => {
                const st = (attendance as Record<string, string>)[s.id];
                const due = dueByStudent.get(s.id);
                return (
                  <TableRow key={s.id}>
                    <TableCell>#{s.code}</TableCell>
                    <TableCell className="font-medium">{s.full_name}</TableCell>
                    <TableCell>{EGP(s.final_amount)}</TableCell>
                    <TableCell>
                      {due ? (
                        <div className="flex flex-col gap-1">
                          <Badge className="w-fit" variant={due.status === "paid" ? "default" : "destructive"}>
                            {DUE_STATUS[due.status]} — {due.period_label}
                          </Badge>
                          {due.status !== "paid" && (
                            <span className="text-xs text-muted-foreground">
                              آخر دفع: {(lastPaid as Record<string, string>)[s.id] ? dateAr((lastPaid as Record<string, string>)[s.id]) : "لا يوجد"}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center gap-1">
                        <Button
                          size="icon"
                          variant={st === "present" ? "default" : "outline"}
                          onClick={() => mark.mutate({ studentId: s.id, status: "present" })}
                          aria-label={ATTENDANCE_STATUS.present}
                        >
                          <Check className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant={st === "absent" ? "destructive" : "outline"}
                          onClick={() => mark.mutate({ studentId: s.id, status: "absent" })}
                          aria-label={ATTENDANCE_STATUS.absent}
                        >
                          <X className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant={st === "makeup" ? "secondary" : "outline"}
                          onClick={() => mark.mutate({ studentId: s.id, status: "makeup" })}
                          aria-label={ATTENDANCE_STATUS.makeup}
                        >
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
    </div>
  );
}