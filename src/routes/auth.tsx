import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { GraduationCap } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | نظام إدارة السنتر" },
      { name: "description", content: "تسجيل الدخول إلى نظام إدارة السنتر التعليمي." },
      { property: "og:title", content: "تسجيل الدخول | نظام إدارة السنتر" },
      { property: "og:description", content: "دخول آمن لموظفي ومديري السنتر التعليمي." },
    ],
  }),
  component: AuthPage,
});

const passwordSchema = z.string().min(6, "كلمة المرور 6 أحرف على الأقل").max(72);
const phoneSchema = z
  .string()
  .trim()
  .regex(/^01[0-9]{9}$/, "رقم هاتف غير صحيح (11 رقم يبدأ بـ 01)");

/** الهاتف يُحوَّل لبريد داخلي ثابت حتى يعمل الدخول بكلمة المرور */
const phoneToEmail = (phone: string) => `p${phone}@phone.center.app`;

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function submit(mode: "signin" | "signup") {
    const pass = passwordSchema.safeParse(password);
    if (!pass.success) {
      toast.error(pass.error.issues[0].message);
      return;
    }
    const identifier = phoneSchema.safeParse(phone);
    if (!identifier.success) {
      toast.error(identifier.error.issues[0].message);
      return;
    }
    const authEmail = phoneToEmail(identifier.data);
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password,
        });
        if (error) throw error;
        toast.success("تم تسجيل الدخول");
      } else {
        const { error } = await supabase.auth.signUp({
          email: authEmail,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: fullName,
              phone: identifier.data,
            },
          },
        });
        if (error) throw error;
        toast.success("تم إنشاء الحساب بنجاح");
      }
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "حدث خطأ";
      toast.error(
        message.includes("Invalid login")
          ? "بيانات الدخول غير صحيحة"
          : message.includes("already registered")
            ? "هذا الحساب مسجّل بالفعل"
            : message,
      );
    } finally {
      setLoading(false);
    }
  }

  const identifierField = (idSuffix: string) => (
    <div className="space-y-2">
      <Label htmlFor={`identifier-${idSuffix}`}>رقم الهاتف</Label>
      <Input
        id={`identifier-${idSuffix}`}
        type="tel"
        inputMode="numeric"
        dir="ltr"
        placeholder="01xxxxxxxxx"
        maxLength={11}
        value={phone}
        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
      />
    </div>
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-accent via-background to-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <GraduationCap className="size-7" />
          </div>
          <h1 className="text-2xl font-extrabold">نظام إدارة السنتر التعليمي</h1>
          <p className="text-sm text-muted-foreground">
            إدارة الطلاب والمجموعات والحضور والمدفوعات في مكان واحد
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>مرحباً بك</CardTitle>
          <CardDescription>
            سجّل الدخول أو أنشئ حساباً جديداً برقم الهاتف
          </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">تسجيل الدخول</TabsTrigger>
                <TabsTrigger value="signup">حساب جديد</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-4 space-y-4">
                {identifierField("signin")}
                <Field label="كلمة المرور" id="password">
                  <Input id="password" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                <Button className="w-full" disabled={loading} onClick={() => submit("signin")}>
                  {loading ? "جارٍ الدخول..." : "دخول"}
                </Button>
              </TabsContent>

              <TabsContent value="signup" className="mt-4 space-y-4">
                <Field label="الاسم الكامل" id="name">
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </Field>
                {identifierField("signup")}
                <Field label="كلمة المرور" id="password2">
                  <Input id="password2" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                <Button className="w-full" disabled={loading} onClick={() => submit("signup")}>
                  {loading ? "جارٍ الإنشاء..." : "إنشاء الحساب"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  أول حساب يتم إنشاؤه يحصل على صلاحيات المدير تلقائياً.
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}