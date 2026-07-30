import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type Hit = { id: string; code: number; full_name: string; phone: string | null };

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const q = term.trim();
    if (!open || q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const numeric = /^\d+$/.test(q);
      let query = supabase.from("students").select("id, code, full_name, phone").limit(12);
      query = numeric
        ? query.or(`code.eq.${q},phone.ilike.%${q}%,guardian_phone.ilike.%${q}%`)
        : query.ilike("full_name", `%${q}%`);
      const { data } = await query;
      if (!cancelled) setHits((data as Hit[]) ?? []);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, open]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">بحث سريع...</span>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="ابحث بالاسم أو الكود أو رقم الهاتف..."
          value={term}
          onValueChange={setTerm}
        />
        <CommandList>
          <CommandEmpty>لا توجد نتائج</CommandEmpty>
          <CommandGroup heading="الطلاب">
            {hits.map((h) => (
              <CommandItem
                key={h.id}
                value={`${h.code} ${h.full_name}`}
                onSelect={() => {
                  setOpen(false);
                  navigate({ to: "/students", search: { q: h.full_name } });
                }}
              >
                <span className="font-medium">{h.full_name}</span>
                <span className="ms-auto text-xs text-muted-foreground">#{h.code}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}