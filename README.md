# Foto con toga — Universitaria Tecnológica de Santander

Aplicación móvil para tomar una fotografía con filtro de toga y birrete y enviarla al nodo `Wait` de n8n.

## Publicar en Vercel

1. Sube esta carpeta a un repositorio de GitHub.
2. En Vercel selecciona **Add New → Project** e importa el repositorio.
3. Vercel detectará **Next.js**. No cambies los comandos predeterminados.
4. Pulsa **Deploy**.

## Enlace desde n8n

En el campo `cameraUrl` del nodo **Crear sesión cámara**, usa:

```javascript
{{
  "https://TU-PROYECTO.vercel.app/?session=" +
  encodeURIComponent($execution.id) +
  "&callback=" +
  encodeURIComponent($execution.resumeUrl)
}}
```

La aplicación enviará al `callback` un POST JSON con:

```json
{
  "status": "success",
  "sessionId": "...",
  "imageBase64": "data:image/jpeg;base64,..."
}
```

La cámara requiere HTTPS y permiso explícito del usuario. MediaPipe se carga en el navegador para ajustar el filtro; si no está disponible, la interfaz permite ajustarlo manualmente.

Al pulsar el obturador, la aplicación realiza la cuenta regresiva, envía la fotografía al callback de n8n y vuelve al chat automáticamente. No requiere una confirmación adicional del usuario.
