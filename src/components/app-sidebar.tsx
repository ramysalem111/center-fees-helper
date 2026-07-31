import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Layers,
  CalendarCheck,
  CalendarPlus,
  Wallet,
  Receipt,
  BarChart3,
  Settings,
  Bell,
  GraduationCap,
  PiggyBank,
} from "lucide-react";

import { usePermissions } from "@/lib/permissions";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const items = [
  { key: "dashboard", title: "لوحة التحكم", url: "/dashboard", icon: LayoutDashboard },
  { key: "students", title: "الطلاب", url: "/students", icon: Users },
  { key: "groups", title: "المجموعات", url: "/groups", icon: Layers },
  { key: "attendance", title: "الحضور", url: "/attendance", icon: CalendarCheck },
  { key: "attendance-record", title: "تسجيل الحضور", url: "/attendance-record", icon: CalendarPlus },
  { key: "payments", title: "المدفوعات", url: "/payments", icon: Wallet },
  { key: "other-income", title: "إيرادات أخرى", url: "/other-income", icon: PiggyBank },
  { key: "expenses", title: "المصروفات", url: "/expenses", icon: Receipt },
  { key: "reports", title: "التقارير", url: "/reports", icon: BarChart3 },
  { key: "notifications", title: "الإشعارات", url: "/notifications", icon: Bell },
  { key: "settings", title: "الإعدادات", url: "/settings", icon: Settings },
] as const;

export function AppSidebar({ centerName }: { centerName?: string }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { can } = usePermissions();

  return (
    <Sidebar collapsible="icon" side="right">
      <SidebarHeader>
        <div className="flex min-w-0 items-center gap-2 px-1 py-2">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <GraduationCap className="size-5" />
          </div>
          <span className="truncate text-sm font-bold">{centerName || "السنتر التعليمي"}</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>القائمة الرئيسية</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.filter((item) => can(item.key)).map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={path.startsWith(item.url)} tooltip={item.title}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}