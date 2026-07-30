import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus, Power } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EGP, WEEK_DAYS, todayISO } from "@/lib/format";
import { generateGroupMonthlyDues, monthAr } from "@/lib/dues";

export const Route = createFileRoute("/_authenticated/groups/")({
  head: () => ({
    meta: [
      { title: "المجموعات | نظام إدارة السنتر" },
      { name: "description", content: "إدارة مجموعات السنتر بنظام شهري أو كل 8 حصص مع المواعيد والرسوم." },
      { property: "og:title", content: "المجموعات | نظام إدارة السنتر" },
      { property: "og:description", content: "مواعيد المجموعات وأنظمة الدفع وعدد الطلاب." },
    ],
  }),
  component: GroupsPage,
});

const emptyGroup = {
  id: undefined as string | undefined,
  name: "",
  academic_year_id: "",
  location_id: "",
  billing_system_id: "",
  collection_type_id: "",
  fee: "0",
  status_id: "",
  study_days: [] as string[],
  schedule_time: "04:00 م - 06:00 م",
};

function GroupsPage() {
  const [form, setForm] = useState(emptyGroup);
  const [open, setOpen] = useState(false);
  const [activateTarget, setActivateTarget] = useState<any | null>(null);
  const [activateMonth, setActivateMonth] = useState(todayISO().slice(0, 7));
  const qc = useQueryClient();

  const { data: lookups } = useQuery({
    queryKey: ["group-lookups"],
    queryFn: async () => {
      const [years, locations, systems, collections, statuses] = await Promise.all([
        supabase.from("academic_years").select("id, name").order("sort_order"),
        supabase.from("locations").select("id, name").order("name"),
        supabase.from("billing_systems").select("id, name, kind").eq("status", "active").order("sort_order"),
        supabase.from("collection_types").select("id, name, code").eq("status", "active").order("sort_order"),
        supabase.from("group_statuses").select("id, name, code").eq("status", "active").order("sort_order"),
      ]);
      return {
        years: years.data ?? [],
        locations: locations.data ?? [],
        systems: systems.data ?? [],
        collections: collections.data ?? [],
        statuses: statuses.data ?? [],
      };
    },
  });

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("groups")
        .select(
          "*, academic_years(name), locations(name), students(count), billing_systems(name, kind), collection_types(name, code), group_statuses(name, code)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (form.name.trim().length < 2) throw new Error("اسم المجموعة مطلوب");
      const system = (lookups?.systems ?? []).find((s: any) => s.id === form.billing_system_id) as any;
      const collection = (lookups?.collections ?? []).find((c: any) => c.id === form.collection_type_id) as any;
      const groupStatus = (lookups?.statuses ?? []).find((s: any) => s.id === form.status_id) as any;
      const payload = {
        name: form.name.trim(),
        academic_year_id: form.academic_year_id || null,
        location_id: form.location_id || null,
        billing_system_id: form.billing_system_id || null,
        collection_type_id: form.collection_type_id || null,
        status_id: form.status_id || null,
        billing_system: (system?.kind === "sessions" ? "per_8_sessions" : "monthly") as
          | "monthly"
          | "per_8_sessions",
        billing_type: (collection?.code === "postpaid" ? "postpaid" : "prepaid") as "prepaid" | "postpaid",
        fee: Number(form.fee) || 0,
        status: (groupStatus?.code === "finished" ? "finished" : "listed") as
          | "open"
          | "listed"
          | "finished"
          | "archived",
        study_days: form.study_days,
        schedule_time: form.schedule_time,
      };
      const { error } = form.id
        ? await supabase.from("groups").update(payload).eq("id", form.id)
        : await supabase.from("groups").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ المجموعة");
      setOpen(false);
      setForm(emptyGroup);
      qc.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activate = useMutation({
    mutationFn: async ({ g, date }: { g: any; date: string }) => {
      if (g.is_active) {
        const { error } = await supabase.from("groups").update({ is_active: false }).eq("id", g.id);
        if (error) throw error;
        return 0;
      }
      const activatedAt = date || todayISO();
      const { error } = await supabase
        .from("groups")
        .update({ is_active: true, activated_at: activatedAt })
        .eq("id", g.id);
      if (error) throw error;
      return await generateGroupMonthlyDues(g.id, activatedAt);
    },
    onSuccess: (n) => {
      toast.success(n ? `تم التفعيل وتوليد ${n} استحقاق` : "تم تحديث حالة التفعيل");
      setActivateTarget(null);
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["dues"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold">المجموعات</h1>
          <p className="text-sm text-muted-foreground">{groups.length} مجموعة</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(emptyGroup); }}>
          <DialogTrigger asChild>
            <Button className="shrink-0 gap-2"><Plus className="size-4" /> مجموعة جديدة</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader><DialogTitle>{form.id ? "تعديل مجموعة" : "مجموعة جديدة"}</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>اسم المجموعة</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>السنة الدراسية</Label>
                <Select value={form.academic_year_id || undefined} onValueChange={(v) => setForm({ ...form, academic_year_id: v })}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    {(lookups?.years ?? []).map((y: any) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>المكان</Label>
                <Select value={form.location_id || undefined} onValueChange={(v) => setForm({ ...form, location_id: v })}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    {(lookups?.locations ?? []).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>نظام الدفع</Label>
                <Select value={form.billing_system_id || undefined} onValueChange={(v) => setForm({ ...form, billing_system_id: v })}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    {(lookups?.systems ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>نوع التحصيل</Label>
                <Select value={form.collection_type_id || undefined} onValueChange={(v) => setForm({ ...form, collection_type_id: v })}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    {(lookups?.collections ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>قيمة الاشتراك</Label>
                <Input type="number" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>الحالة</Label>
                <Select value={form.status_id || undefined} onValueChange={(v) => setForm({ ...form, status_id: v })}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    {(lookups?.statuses ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>الميعاد</Label>
                <Input value={form.schedule_time} onChange={(e) => setForm({ ...form, schedule_time: e.target.value })} placeholder="مثال: 04:00 م - 06:00 م" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>أيام المحاضرات</Label>
                <div className="flex flex-wrap gap-3">
                  {WEEK_DAYS.map((d) => (
                    <label key={d} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={form.study_days.includes(d)}
                        onCheckedChange={(c) =>
                          setForm({
                            ...form,
                            study_days: c
                              ? [...form.study_days, d]
                              : form.study_days.filter((x) => x !== d),
                          })
                        }
                      />
                      {d}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button disabled={save.isPending} onClick={() => save.mutate()}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {isLoading && <p className="text-muted-foreground">جارٍ التحميل...</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((g: any) => (
          <Card key={g.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="min-w-0 truncate text-base">{g.name}</CardTitle>
                <Badge className="ms-auto shrink-0" variant={g.status === "finished" ? "secondary" : "default"}>
                  {g.group_statuses?.name ?? (g.status === "finished" ? "منتهية" : "قائمة")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                {g.academic_years?.name ?? "—"} • {g.locations?.name ?? "—"}
              </p>
              <p>
                {(g.study_days ?? []).join("، ") || "بدون أيام"} — {g.schedule_time ?? "—"}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{g.billing_systems?.name ?? (g.billing_system === "monthly" ? "شهري" : "كل 8 حصص")}</Badge>
                <Badge variant="outline">{g.collection_types?.name ?? (g.billing_type === "prepaid" ? "مقدم" : "مؤخر")}</Badge>
                <Badge variant="outline">{EGP(g.fee)}</Badge>
                <Badge variant="secondary">{g.students?.[0]?.count ?? 0} طالب</Badge>
                <Badge variant={g.is_active ? "default" : "outline"}>
                  {g.is_active ? `مُفعَّلة من ${monthAr(g.activated_at)}` : "غير مُفعَّلة"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button asChild size="sm" className="gap-1">
                  <Link to="/groups/$groupId" params={{ groupId: g.id }}>
                    فتح الشاشة <ArrowLeft className="size-4" />
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setForm({
                      id: g.id,
                      name: g.name,
                      academic_year_id: g.academic_year_id ?? "",
                      location_id: g.location_id ?? "",
                      billing_system_id: g.billing_system_id ?? "",
                      collection_type_id: g.collection_type_id ?? "",
                      fee: String(g.fee),
                      status_id: g.status_id ?? "",
                      study_days: g.study_days ?? [],
                      schedule_time: g.schedule_time ?? "",
                    });
                    setOpen(true);
                  }}
                >
                  تعديل
                </Button>
                <Button
                  size="sm"
                  variant={g.is_active ? "secondary" : "default"}
                  className="gap-1"
                  disabled={activate.isPending}
                  onClick={() => {
                    if (g.is_active) {
                      activate.mutate({ g, date: g.activated_at ?? todayISO() });
                    } else {
                      setActivateDate(g.activated_at ?? todayISO());
                      setActivateTarget(g);
                    }
                  }}
                >
                  <Power className="size-4" /> {g.is_active ? "إيقاف التفعيل" : "تفعيل المجموعة"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!activateTarget} onOpenChange={(o) => !o && setActivateTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>تفعيل المجموعة {activateTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>تاريخ التفعيل</Label>
            <Input type="date" value={activateDate} onChange={(e) => setActivateDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              سيتم توليد استحقاق شهري لكل طلاب المجموعة بدءاً من هذا التاريخ.
            </p>
          </div>
          <DialogFooter>
            <Button
              disabled={activate.isPending || !activateDate}
              onClick={() => activate.mutate({ g: activateTarget, date: activateDate })}
            >
              تفعيل وتوليد الاستحقاقات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}