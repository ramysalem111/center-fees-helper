import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BILLING_SYSTEM, DUE_STATUS, EGP, dateAr, todayISO } from "@/lib/format";
import { monthAr, monthRange } from "@/lib/dues";

export const Route = createFileRoute("/_authenticated/groups/$groupId")({
  head: () => ({
    meta: [
      { title: "شاشة المجموعة | نظام إدارة السنتر" },
      { name: "description", content: "متابعة اشتراكات طلاب المجموعة وحالة الدفع الشهرية." },
      { property: "og:title", content: "شاشة المجموعة | نظام إدارة السنتر" },
      { property: "og:description", content: "حالة الدفع الشهرية لكل طالب في المجموعة." },
    ],
  }),
  component: GroupScreen,
});

function GroupScreen() {
  const { groupId } = Route.useParams();
  const [month, setMonth] = useState<string>(todayISO().slice(0, 7));

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

  const { data: dues = [] } = useQuery({
    queryKey: ["group-dues", groupId, month],
    queryFn: async () => {
      const { data } = await supabase
        .from("dues")
        .select("*")
        .eq("group_id", groupId)
        .eq("period_label", month);
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
        .select("student_id, paid_at, dues(period_label)")
        .in("student_id", ids)
        .order("paid_at", { ascending: false });
      const map: Record<string, { paid_at: string; period?: string | null }> = {};
      for (const p of (data ?? []) as any[]) {
        if (!map[p.student_id]) map[p.student_id] = { paid_at: p.paid_at, period: p.dues?.period_label ?? null };
      }
      return map;
    },
  });

  const dueByStudent = new Map<string, any>();
  for (const d of dues as any[]) if (!dueByStudent.has(d.student_id)) dueByStudent.set(d.student_id, d);

  const monthOptions = (() => {
    const out: string[] = [];
    const now = new Date();
    for (let i = -1; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  })();
  const range = monthRange(month);

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
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-56"><SelectValue placeholder="اختر الشهر" /></SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => <SelectItem key={m} value={m}>{monthAr(m)}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            الاشتراك صالح من {dateAr(range.start)} حتى {dateAr(range.end)} — تاريخ الدفع استرشادي، والمحاسبة على شهر الاستحقاق
          </span>
          <Badge variant="secondary" className="ms-auto">{students.length} طالب</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">حالة الدفع — {monthAr(month)}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الكود</TableHead>
                <TableHead>الاسم</TableHead>
                <TableHead>الاشتراك</TableHead>
                <TableHead>حالة الدفع</TableHead>
                <TableHead>آخر دفع</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">لا يوجد طلاب في هذه المجموعة</TableCell></TableRow>
              )}
              {students.map((s: any) => {
                const due = dueByStudent.get(s.id);
                return (
                  <TableRow key={s.id}>
                    <TableCell>#{s.code}</TableCell>
                    <TableCell className="font-medium">{s.full_name}</TableCell>
                    <TableCell>{EGP(s.final_amount)}</TableCell>
                    <TableCell>
                      {due ? (
                        <Badge
                          className="w-fit"
                          variant={due.status === "paid" ? "default" : due.status === "exempt" ? "secondary" : "destructive"}
                        >
                          {DUE_STATUS[due.status]}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">لا يوجد استحقاق لهذا الشهر</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {(() => {
                        const last = (lastPaid as Record<string, { paid_at: string; period?: string | null }>)[s.id];
                        if (!last) return "لا يوجد";
                        return (
                          <>
                            {last.period ? `استحقاق ${monthAr(last.period)}` : "بدون استحقاق"}
                            <br />
                            <span className="opacity-70">بتاريخ {dateAr(last.paid_at)}</span>
                          </>
                        );
                      })()}
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