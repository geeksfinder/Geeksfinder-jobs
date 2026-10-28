import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Company job boards the 6:00 run reads. They live in board_sources (Admin -> Jobs and sources: add, pause, remove);
 * scripts/boards.json is the starting list and the fallback while the table is empty or migration 021 hasn't run.
 */
export const BOARD_PROVIDERS = ["greenhouse", "lever", "ashby", "smartrecruiters"] as const;
export type BoardProvider = (typeof BOARD_PROVIDERS)[number];
export type Boards = Record<BoardProvider, string[]>;

const empty = (): Boards => ({ greenhouse: [], lever: [], ashby: [], smartrecruiters: [] });

export async function loadBoards(db: SupabaseClient, fallback: Partial<Boards>): Promise<{ boards: Boards; from: "database" | "boards.json" }> {
  const { data, error } = await db.from("board_sources").select("provider, slug").eq("active", true);
  if (!error && data?.length) {
    const boards = empty();
    for (const r of data) if ((BOARD_PROVIDERS as readonly string[]).includes(r.provider)) boards[r.provider as BoardProvider].push(r.slug);
    return { boards, from: "database" };
  }
  return { boards: { ...empty(), ...fallback }, from: "boards.json" };
}

/** Where a board's public job list lives, to check a new board before it's added. SmartRecruiters ids are case-sensitive. */
export function boardUrl(provider: BoardProvider, slug: string) {
  const s = encodeURIComponent(slug);
  return {
    greenhouse: `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`,
    lever: `https://api.lever.co/v0/postings/${s}?mode=json`,
    ashby: `https://api.ashbyhq.com/posting-api/job-board/${s}`,
    smartrecruiters: `https://api.smartrecruiters.com/v1/companies/${s}/postings?country=in&limit=1`,
  }[provider];
}

/** How many open jobs a board's answer lists (any country), or null if it isn't a board. */
export function boardJobCount(provider: BoardProvider, body: unknown): number | null {
  const b = body as { jobs?: unknown[]; totalFound?: number } | unknown[] | null;
  if (provider === "lever") return Array.isArray(b) ? b.length : null;
  if (provider === "smartrecruiters") return b && !Array.isArray(b) && typeof b.totalFound === "number" ? b.totalFound : null;
  return b && !Array.isArray(b) && Array.isArray(b.jobs) ? b.jobs.length : null;
}
