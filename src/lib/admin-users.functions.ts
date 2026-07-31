import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  email: z.string().trim().email("بريد غير صحيح").max(255),
  password: z.string().min(8, "كلمة المرور 8 أحرف على الأقل").max(72),
  full_name: z.string().trim().min(2, "الاسم مطلوب").max(120),
  phone: z.string().trim().max(20).optional().default(""),
  role: z.enum(["admin", "staff"]),
  sections: z.array(z.string().max(40)).max(30).optional().default([]),
});

export const createStaffUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr || !isAdmin) throw new Error("هذه العملية متاحة للمدير فقط");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, phone: data.phone || null },
    });
    if (error) throw new Error(error.message);

    const userId = created.user?.id;
    if (userId && data.role === "admin") {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
    }
    if (userId && data.sections.length) {
      await supabaseAdmin
        .from("user_permissions")
        .upsert(
          data.sections.map((section) => ({ user_id: userId, section })),
          { onConflict: "user_id,section" },
        );
    }
    return { id: userId };
  });