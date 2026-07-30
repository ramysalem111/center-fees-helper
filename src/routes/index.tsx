import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "نظام إدارة السنتر التعليمي" },
      {
        name: "description",
        content: "إدارة الطلاب والمجموعات والحضور والمدفوعات والمصروفات والتقارير للسنتر التعليمي.",
      },
      { property: "og:title", content: "نظام إدارة السنتر التعليمي" },
      {
        property: "og:description",
        content: "لوحة تحكم متكاملة لإدارة سنتر تعليمي بالكامل من الطلاب حتى التقارير المالية.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      navigate({ to: data.session ? "/dashboard" : "/auth", replace: true });
    });
  }, [navigate]);

  return (
    <main className="grid min-h-screen place-items-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
        <h1 className="text-sm">جارٍ تحميل نظام إدارة السنتر...</h1>
      </div>
    </main>
  );
}
