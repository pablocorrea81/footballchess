import { redirect } from "next/navigation";

import { ProfileView } from "@/components/profile/ProfileView";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, show_move_hints")
    .eq("id", session.user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-sky-100 py-12 sm:py-16 lg:py-24">
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 sm:px-6">
        <ProfileView
          profileId={profile.id}
          initialUsername={profile.username}
          initialAvatarUrl={profile.avatar_url}
          initialShowMoveHints={profile.show_move_hints ?? true}
        />
      </main>
    </div>
  );
}

