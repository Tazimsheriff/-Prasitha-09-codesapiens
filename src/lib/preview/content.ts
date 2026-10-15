import type { SessionUser, ProfileSummary } from "@/lib/auth/session";
import type { CoinSummary, LeaderboardEntry } from "@/lib/coins/data";
import type { LedgerRow } from "@/lib/coins/ledger";
import type { OwnProfile, PublicProfile } from "@/lib/profile/data";
import type { MySubmission, TaskSummary } from "@/lib/tasks/data";

export const previewUser: SessionUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "guest@codesapiens.local",
};

export const previewProfile: ProfileSummary = {
  id: previewUser.id,
  username: "guest",
  display_name: "Guest",
  role: "user",
};

const slug = "a1b2c3d4e5f6";

export const previewOwnProfile: OwnProfile = {
  id: previewUser.id,
  username: "guest",
  display_name: "Guest",
  bio: "Here for the challenges. This profile is a preview — nothing is saved yet.",
  is_public: true,
  public_slug: slug,
  social_links: { github: "https://github.com/Prasitha-09" },
  created_at: "2026-08-01T00:00:00.000Z",
};

export const previewTasks: TaskSummary[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Ship a landing page",
    description: "Design and build a one-page site that explains a product in under a minute.",
    requirements: "Live URL, and a short note on the layout decisions you made.",
    reward_coins: 80,
    deadline: "2026-12-01T18:00:00.000Z",
    evidence_required: false,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Debug a broken API",
    description: "A small service returns the wrong status codes. Find the bug and describe the fix.",
    requirements: "Link to your notes or a pull request.",
    reward_coins: 120,
    deadline: "2026-11-20T18:00:00.000Z",
    evidence_required: true,
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    title: "Sketch a badge",
    description: "Draw a small badge for the arena that still reads at the size of a stamp.",
    requirements: "Upload the image, or link to the file.",
    reward_coins: 40,
    deadline: "2026-11-30T18:00:00.000Z",
    evidence_required: false,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    title: "Write a SQL puzzle",
    description: "Author a query that ranks participants and handles ties.",
    requirements: "Paste the query in your submission.",
    reward_coins: 60,
    deadline: "2026-10-01T18:00:00.000Z",
    evidence_required: false,
  },
];

export const previewSubmissions: MySubmission[] = [
  {
    id: "44444444-4444-4444-8444-444444444444",
    task_id: previewTasks[0].id,
    status: "approved",
    proof_text: "Published the page and wrote up the type scale.",
    proof_url: "https://github.com/Prasitha-09/codesapiens",
    has_evidence: false,
    review_note: null,
    created_at: "2026-10-02T10:00:00.000Z",
    reviewed_at: "2026-10-03T15:00:00.000Z",
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    task_id: previewTasks[1].id,
    status: "pending",
    proof_text: "The handler was returning 200 for missing records.",
    proof_url: null,
    has_evidence: false,
    review_note: null,
    created_at: "2026-10-12T09:30:00.000Z",
    reviewed_at: null,
  },
];

export const previewCoinSummary: CoinSummary = {
  balance: 80,
  lifetime_earned: 80,
  rewards_count: 1,
  leaderboard_rank: 2,
  is_public: true,
};

export const previewLedger: LedgerRow[] = [
  {
    id: 1,
    amount: 80,
    kind: "task_reward",
    reason: null,
    created_at: "2026-10-03T15:00:00.000Z",
    task_title: previewTasks[0].title,
  },
];

export const previewLeaderboard: LeaderboardEntry[] = [
  {
    leaderboard_rank: 1,
    username: "nova",
    display_name: "Nova",
    public_slug: "b2c3d4e5f6a1",
    lifetime_coins: 240,
    approved_tasks: 3,
  },
  {
    leaderboard_rank: 2,
    username: previewProfile.username,
    display_name: previewProfile.display_name,
    public_slug: slug,
    lifetime_coins: 80,
    approved_tasks: 1,
  },
  {
    leaderboard_rank: 3,
    username: "pixel",
    display_name: "Pixel",
    public_slug: "c3d4e5f6a1b2",
    lifetime_coins: 60,
    approved_tasks: 1,
  },
];

const publicProfiles: PublicProfile[] = previewLeaderboard.map((entry) => ({
  username: entry.username,
  display_name: entry.display_name,
  avatar_url: null,
  bio: entry.username === "guest" ? previewOwnProfile.bio : "Climbing the Challenge Arena leaderboard.",
  social_links: entry.username === "guest" ? previewOwnProfile.social_links : {},
  lifetime_coins: entry.lifetime_coins,
  leaderboard_rank: entry.leaderboard_rank,
  approved_tasks: entry.approved_tasks,
  member_since: "2026-08-01T00:00:00.000Z",
}));

export function previewPublicProfile(publicSlug: string): PublicProfile | null {
  const entry = previewLeaderboard.find((row) => row.public_slug === publicSlug);
  if (!entry) return null;
  return publicProfiles.find((profile) => profile.username === entry.username) ?? null;
}
