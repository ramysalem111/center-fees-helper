import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
] as const;

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
        </TabsList>
        {TABLES.map((t) => (
          <TabsContent key={t.key} value={t.key}>
            <LookupCard table={t.key} label={t.label} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
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

function LookupCard({ table, label }: { table: string; label: string }) {
  const qc = useQueryClient();
  const [value, setValue] = useState("");

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
      const { error } = await supabase.from(table as never).insert({ name: value.trim() } as never);
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
        <div className="flex gap-2">
          <Input placeholder={`إضافة إلى ${label}`} value={value} onChange={(e) => setValue(e.target.value)} />
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