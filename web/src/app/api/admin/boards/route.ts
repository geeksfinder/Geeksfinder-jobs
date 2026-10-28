import { NextResponse } from "next/server";
import { audit } from "@/lib/admin/audit";
import { AREA_ROLES } from "@/lib/admin/constants";
import { adminError, adminPost } from "@/lib/admin/route";
import { boardJobCount, boardUrl } from "@/lib/boards";
import { safeFetch } from "@/lib/safe-fetch";
import { AdminBoardBody } from "@/lib/validate";

/**
 * Add, pause, resume or remove a company job board (board_sources). A new board is checked first: its public job
 * list must answer, so a typo can't add a board that silently fetches nothing every morning.
 */
export const POST = adminPost(AREA_ROLES.jobs, AdminBoardBody, async ({ admin, user }, { action, provider, slug, company_name }) => {
  const { data: before } = await admin.from("board_sources").select("id, active, company_name").eq("provider", provider).eq("slug", slug).maybeSingle();
  const target = { table: "board_sources", id: `${provider}/${slug}` };

  if (action === "add") {
    if (before) return adminError(409, "exists", before.active ? "That board is already on the list." : "That board is on the list but paused. Resume it instead.");
    let jobs: number | null = null;
    try {
      const res = await safeFetch(boardUrl(provider, slug), { timeoutMs: 15_000, maxBytes: 5_000_000 });
      jobs = res.status === 200 ? boardJobCount(provider, JSON.parse(res.text)) : null;
    } catch {
      jobs = null;
    }
    if (jobs === null) return adminError(422, "not_a_board", `No ${provider} job board answers at "${slug}". Check the id in the board's job-list address${provider === "smartrecruiters" ? " (case matters)" : ""}.`);
    const { error } = await admin.from("board_sources").insert({ provider, slug, company_name: company_name || slug, active: true });
    if (error) return adminError(500, "save_failed", "Couldn't save. Try again.");
    await audit(user.id, "board.add", target, null, { provider, slug, jobs }, admin);
    return NextResponse.json({ ok: true, jobs });
  }

  if (!before) return adminError(404, "not_found", "That board isn't on the list.");
  if (action === "remove") {
    await admin.from("board_sources").delete().eq("id", before.id);
  } else {
    await admin.from("board_sources").update({ active: action === "resume" }).eq("id", before.id);
  }
  await audit(user.id, `board.${action}`, target, { active: before.active }, action === "remove" ? null : { active: action === "resume" }, admin);
  return NextResponse.json({ ok: true });
});
