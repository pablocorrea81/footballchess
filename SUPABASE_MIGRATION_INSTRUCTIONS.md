# Instrucciones para aplicar la migración de invite_code

## Migración: 20251114_add_invite_code.sql

Esta migración agrega el campo `invite_code` a la tabla `games` para permitir el sistema de invitaciones.

## Opción 1: Usando Supabase Dashboard (Recomendado)

1. Ve a [https://app.supabase.com](https://app.supabase.com)
2. Selecciona tu proyecto
3. Ve a **SQL Editor** (en el menú lateral)
4. Haz clic en **New query**
5. Copia y pega el siguiente SQL:

```sql
-- Add invite_code column to games table
-- This column stores a unique code for inviting players to join games

ALTER TABLE games
ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;

-- Create index for fast lookup by invite_code
CREATE INDEX IF NOT EXISTS idx_games_invite_code ON games(invite_code);

-- Add comment to explain the column
COMMENT ON COLUMN games.invite_code IS 'Unique code for inviting players to join the game. Used in invite links.';
```

6. Haz clic en **Run** (o presiona `Ctrl+Enter` / `Cmd+Enter`)
7. Verifica que se ejecutó correctamente (deberías ver "Success" o "Query executed successfully")

## Opción 2: Usando Supabase CLI

Si tienes Supabase CLI instalado y configurado:

```bash
# Desde la raíz del proyecto
supabase db push
```

O si prefieres aplicar solo esta migración específica:

```bash
supabase migration up
```

## Verificar que se aplicó correctamente

Después de aplicar la migración, verifica que el campo se haya agregado:

1. Ve a **Table Editor** en Supabase Dashboard
2. Selecciona la tabla `games`
3. Verifica que existe la columna `invite_code` (debería estar al final de la lista de columnas)

O ejecuta esta query en el SQL Editor:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'games' AND column_name = 'invite_code';
```

Deberías ver una fila con:
- `column_name`: `invite_code`
- `data_type`: `text`
- `is_nullable`: `YES`

## Notas importantes

- Esta migración usa `IF NOT EXISTS`, por lo que es segura ejecutarla múltiples veces
- Las partidas existentes tendrán `invite_code = NULL` hasta que se cree una nueva partida
- Solo las nuevas partidas (no contra IA) tendrán códigos de invitación generados automáticamente
- Los códigos son únicos y de 6 caracteres alfanuméricos (ej: `ABC123`)

