import { NextResponse } from "next/server";
import { audit } from "@/lib/admin/audit";
import { AREA_ROLES } from "@/lib/admin/constants";
import { adminError, adminPost } from "@/lib/admin/route";
import { CronRerunBody } from "@/lib/validate";

/**
 * Re-run a scheduled job now: starts the "Scheduled pipelines" workflow (.github/workflows/daily.yml) on main with the
 * chosen task, through GitHub's workflow_dispatch API. Needs GITHUB_ACTIONS_TOKEN (a fine-grained token for this repo
 * with Actions: read and write, nothing else) and GITHUB_REPOSITORY ("owner/repo") in Vercel.
 */
export const POST = adminPost(AREA_ROLES.crons, CronRerunBody, async ({ admin, user }, { task }) => {
  const token = process.env.GITHUB_ACTIONS_TOKEN?.trim();
  const repo = process.env.GITHUB_REPOSITORY?.trim();
  if (!token || !repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return adminError(503, "not_configured", "Add GITHUB_ACTIONS_TOKEN and GITHUB_REPOSITORY in Vercel to re-run from here. Until then, use Actions → Scheduled pipelines → Run workflow on GitHub.");
  }
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/daily.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { task } }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res || res.status !== 204) {
    const why = res?.status === 401 || res?.status === 403 ? "GitHub refused the token (check it has Actions: read and write on this repo)." : "GitHub didn't start the run. Try again in a minute.";
    return adminError(502, "github_failed", why);
  }
  await audit(user.id, "cron.rerun", { table: "cron_runs", id: task }, null, { task }, admin);
  return NextResponse.json({ ok: true });
});
