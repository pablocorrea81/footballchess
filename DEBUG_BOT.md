# Debugging del Bot - Guía de Troubleshooting

## Problema: Bot trancado en "🤖 FootballBot está analizando su próximo movimiento…"

### Información necesaria para debugging

Por favor, revisa los logs de Vercel y comparte:

1. **Logs del API route** (`/api/games/update`):
   - Busca líneas que contengan `[api/games/update]`
   - Especialmente:
     - `[api/games/update] Updating game:`
     - `[api/games/update] Update successful:`
     - `[api/games/update] Executing bot turn for game:`
     - `[api/games/update] Bot turn execution completed`
     - `[api/games/update] Bot turn error:`

2. **Logs del bot** (`footballBot.ts`):
   - Busca líneas que contengan `[bot]`
   - Especialmente:
     - `[bot] executeBotTurnIfNeeded called for game:`
     - `[bot] Current turn:` vs `[bot] Bot player:`
     - `[bot] Not bot's turn. Current turn:` (si aparece)
     - `[bot] Bot's turn detected, picking move...`
     - `[bot] Move selected:`
     - `[bot] Updating game with payload:`
     - `[bot] Move persisted successfully:`
     - `[bot] Failed to persist move:` (si aparece)

3. **Estado del juego en la base de datos**:
   - ID de la partida que está trancada
   - Estado actual del `game_state` (especialmente el campo `turn`)
   - Valor de `bot_player` en la tabla `games`
   - Valor de `status` en la tabla `games`

### Pasos para obtener los logs

1. Ve a Vercel Dashboard → Tu proyecto → Deployments
2. Haz clic en el deployment más reciente
3. Ve a la pestaña "Logs"
4. Filtra por:
   - `[api/games/update]` para ver los logs del API route
   - `[bot]` para ver los logs del bot
5. Copia los logs relevantes

### Posibles causas

1. **Bot no detecta que es su turno**:
   - El `game_state.turn` no coincide con `bot_player`
   - El bot lee datos desactualizados (race condition)

2. **Bot no puede encontrar movimientos legales**:
   - El bot pasa el turno pero no actualiza el estado
   - Error al actualizar la base de datos

3. **Error silencioso en la actualización**:
   - El bot intenta actualizar pero falla
   - Error de permisos en Supabase

4. **Bot no se está ejecutando**:
   - El API route no llama al bot
   - Error antes de llegar al bot

### Cómo verificar el estado actual

1. Ve a Supabase Dashboard → Table Editor → `games`
2. Busca la partida trancada por ID
3. Revisa:
   - `status`: debería ser `in_progress`
   - `is_bot_game`: debería ser `true`
   - `bot_player`: debería ser `"home"` o `"away"`
   - `game_state->turn`: debería coincidir con `bot_player` si es el turno del bot
   - `game_state->score`: debería mostrar los goles actuales
   - `game_state->history`: debería mostrar los movimientos realizados

### Soluciones temporales

Si el bot está trancado, puedes:

1. **Verificar manualmente el estado**:
   ```sql
   SELECT 
     id, 
     status, 
     is_bot_game, 
     bot_player,
     game_state->>'turn' as current_turn,
     game_state->'score' as score,
     jsonb_array_length(game_state->'history') as move_count
   FROM games 
   WHERE id = 'TU_GAME_ID';
   ```

2. **Actualizar manualmente el turno** (solo para debugging):
   ```sql
   UPDATE games 
   SET game_state = jsonb_set(
     game_state,
     '{turn}',
     '"home"'::jsonb  -- o '"away"' según corresponda
   )
   WHERE id = 'TU_GAME_ID';
   ```

3. **Eliminar la partida y crear una nueva**:
   - Ve al lobby
   - Elimina la partida trancada
   - Crea una nueva partida contra el bot

### Próximos pasos

Una vez que tengas los logs, podremos identificar:
- Si el bot se está ejecutando
- Si el bot detecta correctamente su turno
- Si hay errores en la actualización
- Si hay problemas de sincronización

