import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BILLING_SYSTEM, BILLING_TYPE, EGP, GROUP_STATUS, WEEK_DAYS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/groups")({
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
  billing_system: "monthly",
  billing_type: "prepaid",
  fee: "0",
  status: "open",
  days: [] as number[],
  start_time: "16:00",
  end_time: "18:00",
};

function GroupsPage() {
  const [form, setForm] = useState(emptyGroup);
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data: lookups } = useQuery({
    queryKey: ["group-lookups"],
    queryFn: async () => {
      const [years, locations] = await Promise.all([
        supabase.from("academic_years").select("id, name").order("sort_order"),
        supabase.from("locations").select("id, name").order("name"),
      ]);
      return { years: years.data ?? [], locations: locations.data ?? [] };
    },
  });

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("groups")
        .select("*, academic_years(name), locations(name), students(count)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (form.name.trim().length < 2) throw new Error("اسم المجموعة مطلوب");
      const payload = {
        name: form.name.trim(),
        academic_year_id: form.academic_year_id || null,
        location_id: form.location_id || null,
        billing_system: form.billing_system as never,
        billing_type: form.billing_type as never,
        fee: Number(form.fee) || 0,
        status: form.status as never,
        days: form.days,
        start_time: form.start_time,
        end_time: form.end_time,
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
                <Select value={form.billing_system} onValueChange={(v) => setForm({ ...form, billing_system: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(BILLING_SYSTEM).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>نوع التحصيل</Label>
                <Select value={form.billing_type} onValueChange={(v) => setForm({ ...form, billing_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(BILLING_TYPE).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>قيمة الاشتراك</Label>
                <Input type="number" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>الحالة</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(GROUP_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>من الساعة</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>إلى الساعة</Label>
                <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>أيام المحاضرات</Label>
                <div className="flex flex-wrap gap-3">
                  {WEEK_DAYS.map((d, i) => (
                    <label key={d} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={form.days.includes(i)}
                        onCheckedChange={(c) =>
                          setForm({
                            ...form,
                            days: c ? [...form.days, i].sort() : form.days.filter((x) => x !== i),
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
                <Badge className="ms-auto shrink-0" variant={g.status === "open" ? "default" : "secondary"}>
                  {GROUP_STATUS[g.status]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                {g.academic_years?.name ?? "—"} • {g.locations?.name ?? "—"}
              </p>
              <p>
                {(g.days ?? []).map((d: number) => WEEK_DAYS[d]).join("، ") || "بدون مواعيد"} —{" "}
                {String(g.start_time).slice(0, 5)}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{BILLING_SYSTEM[g.billing_system]}</Badge>
                <Badge variant="outline">{BILLING_TYPE[g.billing_type]}</Badge>
                <Badge variant="outline">{EGP(g.fee)}</Badge>
                <Badge variant="secondary">{g.students?.[0]?.count ?? 0} طالب</Badge>
              </div>
              <div className="flex gap-2 pt-1">
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
                      billing_system: g.billing_system,
                      billing_type: g.billing_type,
                      fee: String(g.fee),
                      status: g.status,
                      days: g.days ?? [],
                      start_time: String(g.start_time).slice(0, 5),
                      end_time: String(g.end_time).slice(0, 5),
                    });
                    setOpen(true);
                  }}
                >
                  تعديل
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}