import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isValidInviteCode } from "@/lib/inviteCode";

type JoinInvitePayload = {
  email?: unknown;
  inviteCode?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | JoinInvitePayload
    | null;

  const email = body?.email;
  const inviteCode = body?.inviteCode;

  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json(
      { error: "Correo inválido" },
      { status: 400 },
    );
  }

  if (typeof inviteCode !== "string" || !isValidInviteCode(inviteCode)) {
    return NextResponse.json(
      { error: "Código de invitación inválido" },
      { status: 400 },
    );
  }

  try {
    // Get game by invite code
    const { data: gameData, error: gameError } = await supabaseAdmin
      .from("games")
      .select("id, status, player_1_id, player_2_id, is_bot_game")
      .eq("invite_code", inviteCode.toUpperCase())
      .single();

    if (gameError || !gameData) {
      return NextResponse.json(
        { error: "Partida no encontrada" },
        { status: 404 },
      );
    }

    const game = gameData as {
      id: string;
      status: string;
      player_1_id: string;
      player_2_id: string | null;
      is_bot_game: boolean;
    };

    // Validate game can be joined
    if (game.status !== "waiting") {
      return NextResponse.json(
        { error: "La partida no está disponible" },
        { status: 400 },
      );
    }

    if (game.is_bot_game) {
      return NextResponse.json(
        { error: "No se puede unir a partidas contra IA" },
        { status: 400 },
      );
    }

    if (game.player_2_id) {
      return NextResponse.json(
        { error: "La partida ya está llena" },
        { status: 400 },
      );
    }

    // Create or get user by email (without email verification)
    const normalizedEmail = email.toLowerCase().trim();
    let userId: string;

    // Try to create user first (if it fails, user might already exist)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      email_confirm: true, // Auto-confirm email (no verification needed)
      user_metadata: {
        display_name: normalizedEmail.split("@")[0], // Use email prefix as default name
      },
    });

    if (createError) {
      // User might already exist, try to get user by email
      // Note: Supabase Admin API doesn't have getUserByEmail, so we use listUsers with filter
      // This is less efficient but necessary for this use case
      const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      
      if (listError || !existingUsers?.users) {
        console.error("[invite/join] Error listing users:", listError);
        return NextResponse.json(
          { error: "Error al buscar usuario. Por favor intenta de nuevo." },
          { status: 500 },
        );
      }

      const existingUser = existingUsers.users.find(u => u.email === normalizedEmail);
      if (!existingUser) {
        console.error("[invite/join] Error creating user and user not found:", createError);
        return NextResponse.json(
          { error: "Error al crear usuario. Por favor intenta de nuevo." },
          { status: 500 },
        );
      }

      userId = existingUser.id;
    } else {
      // User created successfully
      if (!newUser?.user?.id) {
        console.error("[invite/join] User created but no ID returned");
        return NextResponse.json(
          { error: "Error al crear usuario. Por favor intenta de nuevo." },
          { status: 500 },
        );
      }

      userId = newUser.user.id;

      // Create profile for new user (with trigger it should auto-create, but we'll do it explicitly)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: profileError } = await (supabaseAdmin.from("profiles") as any)
        .insert({
          id: userId,
          username: normalizedEmail.split("@")[0], // Use email prefix as username
        });

      if (profileError) {
        // Check if profile already exists (might have been created by trigger)
        const { data: existingProfile } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("id", userId)
          .single();
        
        if (!existingProfile) {
          console.error("[invite/join] Error creating profile:", profileError);
          // Still continue - user exists, profile might be created by trigger
        }
      }
    }

    // Join the game
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: joinError } = await (supabaseAdmin.from("games") as any)
      .update({
        player_2_id: userId,
        status: "in_progress",
        turn_started_at: new Date().toISOString(), // Initialize turn_started_at when game starts
      })
      .eq("id", game.id)
      .is("player_2_id", null); // Use .is() instead of .eq() for null check

    if (joinError) {
      console.error("[invite/join] Error joining game:", joinError);
      return NextResponse.json(
        { error: "Error al unirse a la partida" },
        { status: 500 },
      );
    }

    // Generate magic link for the user to authenticate
    const requestUrl = new URL(request.url);
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      `${requestUrl.protocol}//${requestUrl.host}`;

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: email.toLowerCase().trim(),
      options: {
        redirectTo: `${siteUrl}/play/${game.id}`,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("[invite/join] Error generating link:", linkError);
      // Still return success, user can login manually
      return NextResponse.json({
        success: true,
        gameId: game.id,
        userId: userId,
        // Return action link if available
        actionLink: linkData?.properties?.action_link ?? null,
      });
    }

    return NextResponse.json({
      success: true,
      gameId: game.id,
      userId: userId,
      actionLink: linkData.properties.action_link,
    });
  } catch (error) {
    console.error("[invite/join] Unexpected error:", error);
    return NextResponse.json(
      { error: "Error inesperado" },
      { status: 500 },
    );
  }
}

