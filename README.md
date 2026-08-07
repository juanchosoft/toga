# Foto con toga — Universitaria Tecnológica de Santander

Aplicación móvil para tomar una fotografía con filtro de toga y birrete y enviarla al nodo `Wait` de n8n.

## Publicar en Vercel

1. Sube esta carpeta a un repositorio de GitHub.
2. En Vercel selecciona **Add New → Project** e importa el repositorio.
3. Vercel detectará **Next.js**. No cambies los comandos predeterminados.
4. En el proyecto abre **Storage → Create Database → Blob**, crea un almacén con acceso **Public** y conéctalo al proyecto. Vercel agregará `BLOB_READ_WRITE_TOKEN` automáticamente.
5. Pulsa **Deploy**.

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
  "fileName": "foto-toga-uts-....jpg",
  "imageBase64": "data:image/jpeg;base64,...",
  "imageUrl": "https://....public.blob.vercel-storage.com/...jpg",
  "downloadUrl": "https://....public.blob.vercel-storage.com/...jpg?download=1"
}
```

La cámara requiere HTTPS y permiso explícito del usuario. MediaPipe se carga en el navegador para ajustar el filtro; si no está disponible, la interfaz permite ajustarlo manualmente.

Al pulsar el obturador, la aplicación realiza la cuenta regresiva, descarga la fotografía compuesta con toga, birrete y estola, la publica con una URL única en Vercel Blob, la envía al callback de n8n y vuelve al chat automáticamente. No requiere una confirmación adicional del usuario.
