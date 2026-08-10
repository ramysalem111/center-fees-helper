import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ATTENDANCE_STATUS, DUE_STATUS, EGP, STUDENT_STATUS, dateAr } from "@/lib/format";
import { monthAr } from "@/lib/dues";

export function StudentReportDialog({
  studentId,
  onClose,
}: {
  studentId: string | null;
  onClose: () => void;
}) {
  const enabled = !!studentId;

  const { data, isLoading } = useQuery({
    queryKey: ["student-report", studentId],
    enabled,
    queryFn: async () => {
      const id = studentId as string;
      const [student, dues, payments, attendance] = await Promise.all([
        supabase
          .from("students")
          .select("*, groups(name), academic_years(name), governorates(name)")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("dues")
          .select("*, groups(name)")
          .eq("student_id", id)
          .order("period_label", { ascending: false }),
        supabase
          .from("payments")
          .select("*, payment_methods(name), dues(period_label)")
          .eq("student_id", id)
          .order("paid_at", { ascending: false }),
        supabase
          .from("attendance")
          .select("id, status, class_sessions(session_date, groups(name))")
          .eq("student_id", id)
          .limit(200),
      ]);
      return {
        student: student.data as any,
        dues: (dues.data ?? []) as any[],
        payments: (payments.data ?? []) as any[],
        attendance: ((attendance.data ?? []) as any[]).sort((a, b) =>
          String(b.class_sessions?.session_date ?? "").localeCompare(String(a.class_sessions?.session_date ?? "")),
        ),
      };
    },
  });

  const s = data?.student;
  const totalDue = (data?.dues ?? []).reduce((t, d) => t + Number(d.amount ?? 0), 0);
  const totalPaid = (data?.payments ?? []).reduce((t, p) => t + Number(p.amount ?? 0), 0);
  const unpaid = (data?.dues ?? [])
    .filter((d) => d.status !== "exempt")
    .reduce((t, d) => t + Math.max(Number(d.amount ?? 0) - Number(d.paid_amount ?? 0), 0), 0);
  const present = (data?.attendance ?? []).filter((a) => a.status === "present").length;
  const absent = (data?.attendance ?? []).filter((a) => a.status === "absent").length;

  return (
    <Dialog open={enabled} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>تقرير الطالب {s ? `— ${s.full_name}` : ""}</DialogTitle>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>}

        {s && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <Info label="الكود" value={`#${s.code}`} />
              <Info label="المجموعة" value={s.groups?.name ?? "—"} />
              <Info label="السنة الدراسية" value={s.academic_years?.name ?? "—"} />
              <Info label="المحافظة" value={s.governorates?.name ?? "—"} />
              <Info label="واتساب الطالب" value={s.phone ?? "—"} ltr />
              <Info label="ولي الأمر" value={s.guardian_phone ?? "—"} ltr />
              <Info label="الحالة" value={STUDENT_STATUS[s.status] ?? s.status} />
              <Info label="الاشتراك" value={EGP(s.fee)} />
              <Info label="الخصم / الإعفاء" value={`${EGP(s.discount)} / ${EGP(s.exemption)}`} />
              <Info label="المبلغ النهائي" value={EGP(s.final_amount)} />
              <Info label="تاريخ التسجيل" value={dateAr(s.created_at)} />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="إجمالي المستحق" value={EGP(totalDue)} />
              <Stat label="إجمالي المدفوع" value={EGP(totalPaid)} tone="success" />
              <Stat label="المتبقي" value={EGP(unpaid)} tone={unpaid > 0 ? "danger" : undefined} />
              <Stat label="حضور / غياب" value={`${present} / ${absent}`} />
            </div>

            <Section title="الاستحقاقات وحالة الدفع">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الشهر</TableHead>
                    <TableHead>المجموعة</TableHead>
                    <TableHead>المطلوب</TableHead>
                    <TableHead>المدفوع</TableHead>
                    <TableHead>الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.dues ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">لا توجد استحقاقات</TableCell></TableRow>
                  )}
                  {(data?.dues ?? []).map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>{monthAr(d.period_label)}</TableCell>
                      <TableCell>{d.groups?.name ?? "—"}</TableCell>
                      <TableCell>{EGP(d.amount)}</TableCell>
                      <TableCell>{EGP(d.paid_amount)}</TableCell>
                      <TableCell>
                        <Badge variant={d.status === "paid" ? "default" : d.status === "exempt" ? "secondary" : "destructive"}>
                          {DUE_STATUS[d.status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>

            <Section title="سجل الدفعات">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>شهر الاستحقاق</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>تاريخ الدفع</TableHead>
                    <TableHead>الطريقة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.payments ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">لا توجد دفعات</TableCell></TableRow>
                  )}
                  {(data?.payments ?? []).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.dues?.period_label ? monthAr(p.dues.period_label) : "—"}</TableCell>
                      <TableCell>{EGP(p.amount)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{dateAr(p.paid_at)}</TableCell>
                      <TableCell>{p.payment_methods?.name ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>

            <Section title="سجل الحضور">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>المجموعة</TableHead>
                    <TableHead>الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.attendance ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">لا يوجد حضور مسجل</TableCell></TableRow>
                  )}
                  {(data?.attendance ?? []).map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{dateAr(a.class_sessions?.session_date)}</TableCell>
                      <TableCell>{a.class_sessions?.groups?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={a.status === "present" ? "default" : a.status === "absent" ? "destructive" : "secondary"}>
                          {ATTENDANCE_STATUS[a.status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/60 p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium" dir={ltr ? "ltr" : undefined}>{value}</p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold">{title}</h3>
      <div className="overflow-x-auto rounded-xl border">{children}</div>
    </div>
  );
}