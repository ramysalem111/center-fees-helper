import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Moon, Sun } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useTheme } from "@/hooks/use-theme";
import { AppSidebar } from "@/components/app-sidebar";
import { GlobalSearch } from "@/components/global-search";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SECTIONS, usePermissions } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AppLayout,
});

function AppLayout() {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { dark, toggle } = useTheme();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { loading: permsLoading, allowed } = usePermissions();

  const section = SECTIONS.find((s) => path.startsWith(s.url));
  const denied = !!session && !permsLoading && !!section && !allowed.includes(section.key);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  const { data: settings } = useQuery({
    queryKey: ["center-settings"],
    enabled: !!session,
    queryFn: async () => {
      const { data } = await supabase.from("center_settings").select("*").maybeSingle();
      return data;
    },
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (loading || !session) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">جارٍ التحميل...</div>;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-muted/30">
        <AppSidebar centerName={settings?.center_name} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
            <SidebarTrigger />
            <div className="ms-auto flex items-center gap-2">
              <GlobalSearch />
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="تبديل الوضع الليلي">
                {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={signOut} aria-label="تسجيل الخروج">
                <LogOut className="size-4" />
              </Button>
            </div>
          </header>
          <main className="min-w-0 flex-1 p-4 md:p-6">
            {denied ? (
              <div className="grid min-h-[50vh] place-items-center text-center">
                <div className="space-y-2">
                  <p className="text-lg font-bold">لا تملك صلاحية الوصول لهذه الشاشة</p>
                  <p className="text-sm text-muted-foreground">تواصل مع المدير لمنحك الصلاحية</p>
                </div>
              </div>
            ) : (
              <Outlet />
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}