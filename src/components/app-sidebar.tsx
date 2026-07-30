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
} from "lucide-react";

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
  { title: "لوحة التحكم", url: "/dashboard", icon: LayoutDashboard },
  { title: "الطلاب", url: "/students", icon: Users },
  { title: "المجموعات", url: "/groups", icon: Layers },
  { title: "الحضور", url: "/attendance", icon: CalendarCheck },
  { title: "تسجيل الحضور", url: "/attendance-record", icon: CalendarPlus },
  { title: "المدفوعات", url: "/payments", icon: Wallet },
  { title: "المصروفات", url: "/expenses", icon: Receipt },
  { title: "التقارير", url: "/reports", icon: BarChart3 },
  { title: "الإشعارات", url: "/notifications", icon: Bell },
  { title: "الإعدادات", url: "/settings", icon: Settings },
] as const;

export function AppSidebar({ centerName }: { centerName?: string }) {
  const path = useRouterState({ select: (r) => r.location.pathname });

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
              {items.map((item) => (
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