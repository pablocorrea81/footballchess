import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isValidInviteCode } from "@/lib/inviteCode";
import { InviteView } from "@/components/invite/InviteView";

type InvitePageProps = {
  params: Promise<{
    code: string;
  }> | {
    code: string;
  };
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: InvitePageProps): Promise<Metadata> {
  const resolvedParams = params instanceof Promise ? await params : params;
  const inviteCode = resolvedParams?.code?.toUpperCase().trim();
  
  return {
    title: `Invitación a Football Chess - ${inviteCode}`,
    description: "Únete a una partida de Football Chess. Juego web multijugador.",
    icons: {
      icon: "/icon.svg",
      apple: "/icon.svg",
      shortcut: "/icon.svg",
    },
    openGraph: {
      title: `Invitación a Football Chess - ${inviteCode}`,
      description: "Únete a una partida de Football Chess. Juego web multijugador.",
      type: "website",
      images: [
        {
          url: "/icon.svg",
          width: 512,
          height: 512,
          alt: "Football Chess",
        },
      ],
    },
    twitter: {
      card: "summary",
      title: `Invitación a Football Chess - ${inviteCode}`,
      description: "Únete a una partida de Football Chess. Juego web multijugador.",
      images: ["/icon.svg"],
    },
  };
}

export default async function InvitePage({ params }: InvitePageProps) {
  const supabase = createServerSupabaseClient();
  
  // Resolve params if it's a Promise (Next.js 15+)
  const resolvedParams = params instanceof Promise ? await params : params;
  const inviteCode = resolvedParams?.code?.toUpperCase().trim();

  // Validate invite code format
  if (!inviteCode || !isValidInviteCode(inviteCode)) {
    redirect("/?error=invalid_invite_code");
  }

  // Check if user is already authenticated
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Get game by invite code
  const { data: gameData, error: gameError } = await supabaseAdmin
    .from("games")
    .select("id, status, player_1_id, player_2_id, is_bot_game")
    .eq("invite_code", inviteCode)
    .single();

  if (gameError || !gameData) {
    redirect("/?error=game_not_found");
  }

  const game = gameData as {
    id: string;
    status: string;
    player_1_id: string;
    player_2_id: string | null;
    is_bot_game: boolean;
  };

  // If game is not waiting, redirect with error
  if (game.status !== "waiting") {
    redirect("/?error=game_not_available");
  }

  // If game is a bot game, redirect with error
  if (game.is_bot_game) {
    redirect("/?error=bot_game_invite");
  }

  // If game is full, redirect with error
  if (game.player_2_id) {
    redirect("/?error=game_full");
  }

  // If user is authenticated and is the owner, redirect to game
  if (session && session.user.id === game.player_1_id) {
    redirect(`/play/${game.id}`);
  }

  // If user is authenticated and is already player 2, redirect to game
  if (session && game.player_2_id && session.user.id === game.player_2_id) {
    redirect(`/play/${game.id}`);
  }

  // If user is authenticated, try to join the game
  if (session) {
    // Check if user is already in another game
    const { data: existingGame } = await supabaseAdmin
      .from("games")
      .select("id")
      .or(`player_1_id.eq.${session.user.id},player_2_id.eq.${session.user.id}`)
      .in("status", ["waiting", "in_progress"])
      .neq("id", game.id)
      .single();

    if (existingGame) {
      redirect(`/lobby?error=already_in_game`);
    }

    // Join the game (use admin client to bypass RLS)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: joinError } = await (supabaseAdmin.from("games") as any)
      .update({
        player_2_id: session.user.id,
        status: "in_progress",
        turn_started_at: new Date().toISOString(), // Initialize turn_started_at when game starts
      })
      .eq("id", game.id)
      .is("player_2_id", null);

    if (joinError) {
      redirect("/?error=join_failed");
    }

    // Redirect to game
    redirect(`/play/${game.id}`);
  }

  // User is not authenticated, show invite form with redirect to join after auth
  return <InviteView inviteCode={inviteCode} gameId={game.id} />;
}


