"use server";

import { NextResponse } from "next/server";

import { createRouteSupabaseClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { executeBotTurnIfNeeded, getRandomPlayingStyle, type AIPlayingStyle } from "@/lib/ai/footballBot";
import type { Database } from "@/lib/database.types";

export async function POST(request: Request) {
  const supabase = createRouteSupabaseClient();

  try {
    const { gameId, update } = (await request.json()) as {
      gameId?: string;
      update?: Record<string, unknown>;
    };

    if (!gameId || typeof update !== "object") {
      return NextResponse.json(
        { error: "Missing gameId or update payload" },
        { status: 400 },
      );
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: game, error: fetchError } = await supabase
      .from("games")
      .select("player_1_id, player_2_id, is_bot_game, status")
      .eq("id", gameId)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 404 });
    }

    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const userId = session.user.id;
    const isParticipant =
      game.player_1_id === userId ||
      (game.player_2_id !== null && game.player_2_id === userId);

    if (!isParticipant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updatePayload =
      update as Database["public"]["Tables"]["games"]["Update"];

    // Check if turn changed - if so, update turn_started_at
    const gameState = updatePayload.game_state as unknown as { turn?: string } | undefined;
    if (gameState?.turn) {
      // Get current game state to compare turns
      const { data: currentGameData } = await supabaseAdmin
        .from("games")
        .select("game_state")
        .eq("id", gameId)
        .single();
      
      const currentGame = currentGameData as { game_state: unknown } | null;
      const currentGameState = currentGame?.game_state as unknown as { turn?: string } | undefined;
      const currentTurn = currentGameState?.turn;
      const newTurn = gameState.turn;
      
      // If turn changed, update turn_started_at to now
      if (currentTurn !== newTurn) {
        console.log("[api/games/update] Turn changed from", currentTurn, "to", newTurn, "- updating turn_started_at");
        updatePayload.turn_started_at = new Date().toISOString();
      }
    }

    console.log("[api/games/update] Updating game:", gameId, "payload:", JSON.stringify(updatePayload));

    // Check if the update is trying to set status to "finished"
    const isFinishingGame = updatePayload.status === "finished";
    
    // If finishing the game, set finished_at to current timestamp
    if (isFinishingGame && !updatePayload.finished_at) {
      updatePayload.finished_at = new Date().toISOString();
      console.log("[api/games/update] Game finishing, setting finished_at:", updatePayload.finished_at);
    }
    
    // Use admin client to update, bypassing RLS
    // If we're finishing the game, we need to allow the update even if status is already "finished"
    // (this shouldn't happen, but we handle it)
    // Otherwise, we prevent updates to already finished games
    let updateQuery = (supabaseAdmin.from("games") as any)
      .update(updatePayload)
      .eq("id", gameId);
    
    // Only filter out finished games if we're NOT finishing the game
    // This allows setting status to "finished" from "in_progress"
    if (!isFinishingGame) {
      updateQuery = updateQuery.neq("status", "finished");
    }
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error, data: updateResult } = await updateQuery.select();

    if (error) {
      console.error("[api/games/update] Update error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.log("[api/games/update] Update successful. Updated rows:", updateResult?.length ?? 0);
    
    // Check if no rows were updated (game might already be finished or doesn't exist)
    if (!updateResult || updateResult.length === 0) {
      console.warn("[api/games/update] No rows updated. Game might already be finished or doesn't exist.");
      // If we're trying to finish the game and no rows were updated, check if it's already finished
      if (isFinishingGame) {
        const { data: currentGameData } = await supabaseAdmin
          .from("games")
          .select("status, winner_id")
          .eq("id", gameId)
          .single();
        
        const currentGame = currentGameData as { status: string; winner_id: string | null } | null;
        if (currentGame && currentGame.status === "finished") {
          console.log("[api/games/update] Game is already finished. Returning success.");
          return NextResponse.json({ 
            ok: true, 
            message: "Game is already finished",
            alreadyFinished: true 
          });
        }
      }
      return NextResponse.json(
        { error: "No rows updated. Game might not exist or already be finished." },
        { status: 400 }
      );
    }
    
    if (updateResult && updateResult[0]) {
      const updatedGame = updateResult[0] as Database["public"]["Tables"]["games"]["Row"];
      const gameState = updatedGame.game_state as unknown as { turn?: string };
      console.log("[api/games/update] Updated game state turn:", gameState?.turn);
      
      // If game was just finished, log it
      if (isFinishingGame) {
        console.log("[api/games/update] Game finished! Winner:", updatedGame.winner_id);
      }
    }

    // Only execute bot turn if this is a bot game and the update was successful
    if (game.is_bot_game && updateResult && updateResult.length > 0) {
      const updatedGame = updateResult[0] as Database["public"]["Tables"]["games"]["Row"];
      const gameState = updatedGame.game_state as unknown as { turn?: string; score?: { home: number; away: number } };
      
      console.log("[api/games/update] Bot game detected, preparing to execute bot turn for game:", gameId);
      console.log("[api/games/update] Updated game state - turn:", gameState?.turn, "score:", gameState?.score);
      
      // Check if a goal was scored by comparing scores
      // If score increased, change AI playing style randomly (only for hard/pro difficulties)
      const botDifficulty = updatedGame.bot_difficulty as string | null;
      if (botDifficulty === "hard" || botDifficulty === "pro") {
        // Get previous game state to compare scores
        const { data: previousGameData } = await supabaseAdmin
          .from("games")
          .select("game_state, bot_style")
          .eq("id", gameId)
          .single();
        
        if (previousGameData) {
          const previousGameRow = previousGameData as Database["public"]["Tables"]["games"]["Row"];
          const previousGameState = (previousGameRow.game_state as unknown as { score?: { home: number; away: number } }) || {};
          const previousScore = previousGameState.score || { home: 0, away: 0 };
          const newScore = gameState?.score || { home: 0, away: 0 };
          
          // Check if score increased (a goal was scored)
          const scoreIncreased = 
            newScore.home > previousScore.home || 
            newScore.away > previousScore.away;
          
          if (scoreIncreased) {
            // Goal was scored! Change AI playing style randomly
            const newStyle: AIPlayingStyle = getRandomPlayingStyle();
            const previousStyle = previousGameRow.bot_style as string | null;
            console.log(`[api/games/update] 🎯 Goal detected! Changing AI style from ${previousStyle || "none"} to ${newStyle}`);
            
            // Update bot_style in database
            await (supabaseAdmin.from("games") as any)
              .update({ bot_style: newStyle })
              .eq("id", gameId);
            
            console.log(`[api/games/update] ✅ AI style updated to: ${newStyle}`);
          }
        }
      }
      
      // Verify the update was successful by checking the turn
      // If the turn is now the bot's turn, execute the bot move
      const botPlayer = updatedGame.bot_player as "home" | "away" | null;
      if (botPlayer && gameState?.turn === botPlayer) {
        console.log("[api/games/update] Bot's turn confirmed, executing bot move...");
        
        // Small delay to ensure database consistency
        await new Promise((resolve) => setTimeout(resolve, 200));
        
        try {
          console.log("[api/games/update] Executing bot turn for game:", gameId);
          await executeBotTurnIfNeeded(gameId);
          console.log("[api/games/update] Bot turn execution completed successfully");
        } catch (botError) {
          console.error("[api/games/update] Bot turn error:", botError);
          if (botError instanceof Error) {
            console.error("[api/games/update] Bot error message:", botError.message);
            console.error("[api/games/update] Bot error stack:", botError.stack);
          } else {
            console.error("[api/games/update] Bot error (non-Error):", JSON.stringify(botError, null, 2));
          }
          // Don't fail the request if bot turn fails
        }
      } else {
        console.log("[api/games/update] Not bot's turn yet. Current turn:", gameState?.turn, "Bot player:", botPlayer);
      }
    } else if (game.is_bot_game) {
      console.log("[api/games/update] Bot game but update result is empty, skipping bot turn");
    } else {
      console.log("[api/games/update] Not a bot game, skipping bot turn execution");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

