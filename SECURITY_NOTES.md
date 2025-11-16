# Notas de Seguridad - Requests a WordPress

## ¿Qué está pasando?

Los requests a `/wp-admin/setup-config.php` que ves en los logs de Vercel **NO son de tu aplicación**. Son bots automatizados escaneando internet buscando instalaciones vulnerables de WordPress.

Esto es **completamente normal** y le pasa a casi todos los sitios web públicos.

## ¿Son peligrosos?

**No, estos requests no son peligrosos** porque:
1. Tu aplicación **no tiene WordPress instalado**
2. Estos bots están buscando rutas que **no existen** en tu app
3. Next.js simplemente devuelve un 404 (Not Found) para estas rutas
4. No pueden ejecutar código ni acceder a tus datos

## ¿Quién hace estos requests?

Son **bots automatizados** (scripts) que:
- Escanean millones de URLs buscando WordPress
- Buscan vulnerabilidades conocidas
- Son operados por atacantes o investigadores de seguridad
- Ejecutan miles de requests por día en millones de sitios

## ¿Qué puedes hacer?

### Opción 1: Ignorarlos (Recomendado)
Simplemente ignóralos. No afectan tu aplicación y son parte normal del tráfico web.

### Opción 2: Bloquear IPs sospechosas en Vercel
En el dashboard de Vercel:
1. Settings → Security
2. Puedes configurar IP Allowlist/Blocklist
3. **Nota**: Bloquear IPs individuales no es efectivo porque estos bots usan muchas IPs

### Opción 3: Monitorear el tráfico
Puedes ver estos requests en:
- **Vercel Dashboard** → Tu Proyecto → Deployments → Logs
- Filtra por `wp-admin` o `wordpress` para ver solo estos requests

### Opción 4: Agregar logging personalizado
Podrías agregar logging en `middleware.ts` para registrar estos requests, pero generalmente no es necesario.

## ¿Qué rutas son normales para tu app?

Tus rutas legítimas son:
- `/` - Página principal
- `/lobby` - Lobby de juegos
- `/play/[gameId]` - Juego específico
- `/profile` - Perfil de usuario
- `/stats` - Estadísticas
- `/team` - Equipos
- `/learn` - Tutorial
- `/api/*` - API routes

Cualquier otra ruta (como `/wp-admin/*`, `/admin/*` de WordPress, etc.) devolverá 404 y es tráfico de bots.

## Recomendaciones de Seguridad

1. ✅ **Tu aplicación ya está segura** - No hay WordPress, así que estos bots no pueden hacer nada
2. ✅ **Mantén Next.js actualizado** - Ya estás usando una versión reciente
3. ✅ **Usa HTTPS** - Vercel lo configura automáticamente
4. ✅ **Variables de entorno** - Ya estás usando variables de entorno para API keys (no hardcoded)
5. ✅ **Autenticación** - Ya tienes autenticación con Supabase

## Conclusión

**No te preocupes por estos requests**. Son bots normales escaneando la web. Tu aplicación está segura porque:
- No tienes WordPress instalado
- Los requests a rutas inexistentes devuelven 404
- No pueden acceder a tu código o datos

Si quieres, puedes filtrar estos requests en los logs de Vercel para no verlos, pero no es necesario hacer nada más.

