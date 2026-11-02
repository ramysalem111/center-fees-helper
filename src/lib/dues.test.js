import { afterEach, expect, mock, test } from "bun:test";

const responses: Record<string, unknown[]> = {};
const inserted: Record<string, unknown>[] = [];

mock.module("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      const result = { data: responses[table]?.shift() ?? [], error: null };
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "order", "limit", "maybeSingle", "single"]) {
        chain[method] = () => chain;
      }
      chain.insert = (rows: Record<string, unknown>[] | Record<string, unknown>) => {
        inserted.push(...(Array.isArray(rows) ? rows : [rows]));
        return chain;
      };
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
      return chain;
    },
  },
}));

const { generateGroupMonthlyDues, syncStudentDues, ensureDueForMonth } = await import("./dues");

afterEach(() => {
  inserted.length = 0;
  for (const key of Object.keys(responses)) delete responses[key];
});

const month = new Date().toISOString().slice(0, 7);

test("mixed exempt and non-exempt batch gives every due a non-null status", async () => {
  responses.students = [[
    { id: "regular", fee: 350, created_at: `${month}-01`, permanent_exempt: false },
    { id: "exempt", fee: 350, created_at: `${month}-01`, permanent_exempt: true },
  ]];
  responses.dues = [[]];
  await generateGroupMonthlyDues("group", month);
  expect(inserted.length).toBeGreaterThanOrEqual(2);
  expect(inserted.filter(row => row.student_id === "regular").every(row => row.status === "unpaid")).toBe(true);
  expect(inserted.filter(row => row.student_id === "exempt").every(row => row.status === "exempt")).toBe(true);
});

test("student synchronization explicitly initializes unpaid dues", async () => {
  responses.students = [{ id: "regular", status: "active", archived: false, group_id: "group", fee: 350, created_at: `${month}-01`, permanent_exempt: false }];
  responses.groups = [{ id: "group", is_active: true, activated_at: month }];
  responses.dues = [[], [], [], []];
  await syncStudentDues("regular");
  expect(inserted.length).toBeGreaterThan(0);
  expect(inserted.every(row => row.status === "unpaid")).toBe(true);
});

test("payment-created due explicitly initializes unpaid status", async () => {
  responses.dues = [null, { id: "new-due" }];
  responses.students = [{ fee: 350, group_id: "group" }];
  await ensureDueForMonth("regular", "group", month);
  expect(inserted[0]?.status).toBe("unpaid");
});