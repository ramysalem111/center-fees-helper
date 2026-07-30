export const EGP = (n: number | null | undefined) =>
  new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(Number(n ?? 0));

export const num = (n: number | null | undefined) =>
  new Intl.NumberFormat("ar-EG").format(Number(n ?? 0));

export const dateAr = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(new Date(d));
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const monthLabel = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export const WEEK_DAYS = [
  "السبت",
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
];

export const STUDENT_STATUS: Record<string, string> = {
  active: "نشط",
  suspended: "موقوف",
  withdrawn: "منسحب",
};

export const GROUP_STATUS: Record<string, string> = {
  open: "مفتوحة",
  listed: "قائمة",
  finished: "منتهية",
  archived: "مؤرشفة",
};

export const BILLING_SYSTEM: Record<string, string> = {
  monthly: "شهري",
  per_8_sessions: "كل 8 حصص",
};

export const BILLING_TYPE: Record<string, string> = {
  prepaid: "مقدم",
  postpaid: "مؤخر",
};

export const ATTENDANCE_STATUS: Record<string, string> = {
  present: "حاضر",
  absent: "غائب",
  makeup: "تعويض",
};

export const DUE_STATUS: Record<string, string> = {
  unpaid: "غير مدفوع",
  partial: "مدفوع جزئياً",
  paid: "مدفوع",
};

export function waLink(phone: string | null | undefined, text = "") {
  if (!phone) return null;
  const clean = phone.replace(/\D/g, "").replace(/^0/, "20");
  return `https://wa.me/${clean}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}