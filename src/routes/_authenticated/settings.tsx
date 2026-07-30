import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { createStaffUser } from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات | نظام إدارة السنتر" },
      { name: "description", content: "إعدادات السنتر والسنوات الدراسية والأماكن والمحافظات وطرق الدفع." },
      { property: "og:title", content: "الإعدادات | نظام إدارة السنتر" },
      { property: "og:description", content: "ضبط البيانات الأساسية للنظام." },
    ],
  }),
  component: SettingsPage,
});

const TABLES = [
  { key: "academic_years", label: "السنوات الدراسية" },
  { key: "locations", label: "الأماكن" },
  { key: "governorates", label: "المحافظات" },
  { key: "payment_methods", label: "طرق الدفع" },
  { key: "expense_types", label: "أنواع المصروفات" },
  {
    key: "billing_systems",
    label: "أنظمة الدفع",
    extra: {
      column: "kind",
      label: "طريقة الاحتساب",
      options: [
        { value: "monthly", label: "شهري" },
        { value: "sessions", label: "بعدد الحصص" },
      ],
    },
  },
  {
    key: "collection_types",
    label: "أنواع التحصيل",
    extra: {
      column: "code",
      label: "التوقيت",
      options: [
        { value: "prepaid", label: "مقدم" },
        { value: "postpaid", label: "مؤخر" },
      ],
    },
  },
  {
    key: "group_statuses",
    label: "حالات المجموعة",
    extra: {
      column: "code",
      label: "المعالجة",
      options: [
        { value: "listed", label: "قائمة (نشطة)" },
        { value: "finished", label: "منتهية" },
      ],
    },
  },
] as { key: string; label: string; extra?: Extra }[];

type Extra = { column: string; label: string; options: { value: string; label: string }[] };

function SettingsPage() {
  return (
    <div className="space-y-4">
      <header className="min-w-0">
        <h1 className="truncate text-2xl font-extrabold">الإعدادات</h1>
        <p className="text-sm text-muted-foreground">بيانات السنتر والقوائم الأساسية</p>
      </header>

      <CenterCard />

      <Tabs defaultValue={TABLES[0].key}>
        <TabsList className="flex-wrap">
          {TABLES.map((t) => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}
          <TabsTrigger value="users">المستخدمون</TabsTrigger>
        </TabsList>
        {TABLES.map((t) => (
          <TabsContent key={t.key} value={t.key}>
            <LookupCard table={t.key} label={t.label} extra={t.extra} />
          </TabsContent>
        ))}
        <TabsContent value="users">
          <UsersCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UsersCard() {
  const qc = useQueryClient();
  const addUser = useServerFn(createStaffUser);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "", role: "staff" });

  const { data: users = [] } = useQuery({
    queryKey: ["app-users"],
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        supabase.from("profiles").select("id, full_name, phone, created_at").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const roleMap = new Map((roles.data ?? []).map((r) => [r.user_id, r.role]));
      return (profiles.data ?? []).map((p) => ({ ...p, role: roleMap.get(p.id) ?? "staff" }));
    },
  });

  const create = useMutation({
    mutationFn: async () =>
      addUser({
        data: {
          full_name: form.full_name,
          email: form.email,
          phone: form.phone,
          password: form.password,
          role: form.role as "admin" | "staff",
        },
      }),
    onSuccess: () => {
      toast.success("تم إنشاء الحساب");
      setForm({ full_name: "", email: "", phone: "", password: "", role: "staff" });
      qc.invalidateQueries({ queryKey: ["app-users"] });
    },
    onError: (e: Error) => toast.error(e.message || "تعذّر إنشاء الحساب"),
  });

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">إنشاء حساب مستخدم جديد</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>الاسم</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>البريد الإلكتروني</Label>
            <Input dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>رقم الهاتف</Label>
            <Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>كلمة المرور</Label>
            <Input dir="ltr" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>الصلاحية</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">موظف</SelectItem>
                <SelectItem value="admin">مدير</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button className="gap-2" disabled={create.isPending} onClick={() => create.mutate()}>
              <UserPlus className="size-4" /> إنشاء الحساب
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold">المستخدمون الحاليون</p>
          {users.map((u: any) => (
            <div key={u.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
              <span className="font-medium">{u.full_name || "بدون اسم"}</span>
              <span className="text-muted-foreground" dir="ltr">{u.phone ?? ""}</span>
              <Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role === "admin" ? "مدير" : "موظف"}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CenterCard() {
  const qc = useQueryClient();
  const [name, setName] = useState("");

  const { data } = useQuery({
    queryKey: ["center-settings"],
    queryFn: async () => (await supabase.from("center_settings").select("*").maybeSingle()).data,
  });

  useEffect(() => {
    if (data?.center_name) setName(data.center_name);
  }, [data?.center_name]);

  const save = useMutation({
    mutationFn: async () => {
      if (name.trim().length < 2) throw new Error("اسم السنتر مطلوب");
      const { error } = await supabase
        .from("center_settings")
        .upsert({ id: true, center_name: name.trim() }, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حفظ الإعدادات");
      qc.invalidateQueries({ queryKey: ["center-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">بيانات السنتر</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1 space-y-1.5">
          <Label>اسم السنتر</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>حفظ</Button>
      </CardContent>
    </Card>
  );
}

function LookupCard({ table, label, extra }: { table: string; label: string; extra?: Extra }) {
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [extraValue, setExtraValue] = useState(extra?.options[0].value ?? "");

  const { data: rows = [] } = useQuery({
    queryKey: ["lookup", table],
    queryFn: async () => {
      const { data, error } = await supabase.from(table as never).select("*").limit(200);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (value.trim().length < 2) throw new Error("أدخل اسماً صحيحاً");
      const payload: Record<string, unknown> = { name: value.trim() };
      if (extra) payload[extra.column] = extraValue;
      const { error } = await supabase.from(table as never).insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setValue("");
      toast.success("تمت الإضافة");
      qc.invalidateQueries({ queryKey: ["lookup", table] });
      qc.invalidateQueries({ queryKey: ["lookups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["lookup", table] });
    },
    onError: () => toast.error("تعذّر الحذف — قد يكون العنصر مستخدماً أو الصلاحية للمدير فقط"),
  });

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{label}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input placeholder={`إضافة إلى ${label}`} value={value} onChange={(e) => setValue(e.target.value)} />
          {extra && (
            <Select value={extraValue} onValueChange={setExtraValue}>
              <SelectTrigger className="w-44"><SelectValue placeholder={extra.label} /></SelectTrigger>
              <SelectContent>
                {extra.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button className="gap-1 shrink-0" onClick={() => add.mutate()} disabled={add.isPending}>
            <Plus className="size-4" /> إضافة
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">لا توجد عناصر</p>}
          {rows.map((r) => (
            <Badge key={r.id} variant="secondary" className="gap-1 py-1.5 ps-1 pe-2 text-sm">
              <Button
                size="icon"
                variant="ghost"
                className="size-5"
                onClick={() => remove.mutate(r.id)}
                aria-label={`حذف ${r.name}`}
              >
                <Trash2 className="size-3 text-destructive" />
              </Button>
              {r.name}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}