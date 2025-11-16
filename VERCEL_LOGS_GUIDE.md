# Guía: Cómo ver los logs de Gemini en Vercel

## Paso a paso para ver logs de Gemini AI

### 1. Accede a los logs de tu deployment

1. Ve a: https://vercel.com/dashboard
2. Selecciona tu proyecto **footballchess**
3. Haz clic en la pestaña **"Deployments"**
4. Haz clic en el **deployment más reciente** (el que tiene el check verde ✅)
5. En la parte superior, verás varias pestañas. Haz clic en **"Functions"** o **"Runtime Logs"**

### 2. Filtra los logs de Gemini

Los logs de Gemini aparecen cuando:
- Es el turno del bot en un juego
- Se ejecuta `/api/games/update` cuando `botPlayer` es el jugador actual

**Para filtrar:**
- En la barra de búsqueda de logs, escribe: `[Gemini]`
- O busca: `gemini` (case insensitive)
- Esto mostrará solo los logs relacionados con Gemini

### 3. ¿Cuándo aparecen los logs?

Los logs de Gemini **NO aparecen en cada request HTTP**. Solo aparecen cuando:
1. Un jugador hace un movimiento
2. El turno cambia al bot
3. El bot ejecuta su turno (llama a `/api/games/update`)
4. El bot usa Gemini AI (solo en dificultad "hard")

### 4. Ejemplo de lo que deberías ver:

```
[Gemini] ✅ API key loaded from GEMINI_API_KEY (AIzaSyBnCj...wL2o)
[Gemini] ✅ Gemini AI initialized successfully
[Gemini] ========== AI DECISION ANALYSIS ==========
[Gemini] Bot Player: away, Total legal moves: 58
[Gemini] Move Analysis Summary:
[Gemini]   - Blocking moves: 2
[Gemini]   - Opponent threats detected: 1
[Gemini] ✅ SELECTED MOVE #3: D4→D3 (D)
[Gemini] 💡 REASON: 🛡️ BLOCK - Blocks delantero at D11
```

### 5. Si no ves logs de Gemini:

- **Verifica que estés jugando en modo "difícil"** (hard)
- **Espera a que sea el turno del bot** - los logs solo aparecen cuando el bot ejecuta
- **Busca en "Runtime Logs"** no en "Build Logs"
- **Filtra por `[Gemini]`** o `[bot]` para encontrar los logs relevantes

### 6. Alternativa: Ver logs en tiempo real

Puedes usar la CLI de Vercel para ver logs en tiempo real:

```bash
npm i -g vercel
vercel login
vercel logs footballchess --follow
```

Esto mostrará todos los logs en tiempo real, y puedes filtrar con `grep`:

```bash
vercel logs footballchess --follow | grep "\[Gemini\]"
```

## Nota sobre los logs de WordPress

Si ves requests a `/wp-admin/setup-config.php`, esto es normal si tienes WordPress en el mismo dominio. Estos son logs HTTP separados de los logs de ejecución de funciones donde aparecen los logs de Gemini.

