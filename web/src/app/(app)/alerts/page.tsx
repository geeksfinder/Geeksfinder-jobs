import { canSendTestAlert } from "@/lib/alerts";
import { featureTier } from "@/lib/pricing";
import { requireUser } from "@/lib/supabase/server";
import { AlertForm } from "./AlertForm";
import { DeleteAccount } from "./DeleteAccount";
import { TestAlert } from "./TestAlert";

export const metadata = { title: "Alerts" };

export default async function AlertsPage() {
  const { supabase, user } = await requireUser();
  const [{ data: u }, { data: a }] = await Promise.all([
    supabase.from("users").select("plan, telegram_chat_id").eq("id", user!.id).single(),
    supabase.from("alert_settings").select("frequency, channels, alert_hour, quiet_hours").eq("user_id", user!.id).maybeSingle(),
  ]);
  const q = /\[(\d+),(\d+)\)/.exec((a?.quiet_hours as string | null) ?? "");

  return (
    <>
      <h1 className="text-h1 font-bold md:text-h1-lg">Alerts</h1>
      <p className="mb-6 mt-1 text-body text-ink-2">Choose how often and where your matches arrive.</p>
      {canSendTestAlert(user!.created_at) && <TestAlert telegramConnected={!!u?.telegram_chat_id} email={user!.email ?? ""} />}
      <div id="alerts-form">
        <AlertForm
          plan={featureTier(u?.plan)}
          telegramConnected={!!u?.telegram_chat_id}
          initial={{
            frequency: a?.frequency ?? "weekly",
            channels: a?.channels ?? ["telegram"],
            alertHour: a?.alert_hour ?? 7,
            quietStart: q ? Number(q[1]) : 22,
            quietEnd: q ? Number(q[2]) : 7,
          }}
        />
      </div>
      <DeleteAccount />
    </>
  );
}
