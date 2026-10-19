import { redirect } from "next/navigation";
import { featureTier } from "@/lib/pricing";
import { ToastProvider } from "@/components/ui/Toast";
import { Wordmark } from "@/components/ui/Wordmark";
import { requireUser } from "@/lib/supabase/server";
import { Wizard } from "./Wizard";

export const metadata = { title: "Get started", robots: { index: false } };

export default async function Onboarding() {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/login?next=/onboarding");
  const [{ data: p }, { data: a }, { data: u }] = await Promise.all([
    supabase.from("profiles").select("skills, preferred_roles, locations, job_type").eq("user_id", user.id).maybeSingle(),
    supabase.from("alert_settings").select("frequency, channels, alert_hour").eq("user_id", user.id).maybeSingle(),
    supabase.from("users").select("plan, telegram_chat_id, name").eq("id", user.id).single(),
  ]);

  return (
    <ToastProvider>
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-2xl items-center px-4">
          <Wordmark href="/dashboard" />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8 md:py-12">
        <Wizard
          initial={{
            skills: p?.skills ?? [],
            roles: p?.preferred_roles ?? [],
            locations: p?.locations ?? [],
            jobType: (p?.job_type as "full-time" | "internship" | "both") ?? "full-time",
            frequency: a?.frequency ?? "weekly",
            channels: a?.channels ?? ["telegram"],
            alertHour: a?.alert_hour ?? 7,
            telegramConnected: !!u?.telegram_chat_id,
            plan: featureTier(u?.plan),
          }}
        />
      </main>
    </ToastProvider>
  );
}
