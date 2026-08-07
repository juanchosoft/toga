import { put } from "@vercel/blob";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 4_000_000;
const ALLOWED_CALLBACK_HOST = "n8n.spidersoftwareia.com";

export async function POST(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const origin = request.headers.get("origin");
    if (origin && origin !== requestUrl.origin) {
      return Response.json({ error: "Origen no permitido" }, { status: 403 });
    }

    const form = await request.formData();
    const file = form.get("file");
    const callbackValue = form.get("callback");
    const sessionValue = form.get("sessionId");

    if (!(file instanceof File) || !file.type.startsWith("image/")) {
      return Response.json({ error: "La fotografía no es válida" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return Response.json({ error: "La fotografía supera el tamaño permitido" }, { status: 413 });
    }
    if (typeof callbackValue !== "string" || typeof sessionValue !== "string") {
      return Response.json({ error: "Sesión incompleta" }, { status: 400 });
    }

    const callback = new URL(callbackValue);
    const safeSession = sessionValue.replace(/[^a-zA-Z0-9_-]/g, "-");
    if (
      callback.protocol !== "https:" ||
      callback.hostname !== ALLOWED_CALLBACK_HOST ||
      !callback.pathname.includes(`/webhook-waiting/${encodeURIComponent(sessionValue)}`)
    ) {
      return Response.json({ error: "Sesión no autorizada" }, { status: 403 });
    }

    const blob = await put(`graduacion/foto-toga-uts-${safeSession}.jpg`, file, {
      access: "public",
      addRandomSuffix: true,
      cacheControlMaxAge: 86_400,
    });

    return Response.json({
      url: blob.url,
      downloadUrl: blob.downloadUrl ?? `${blob.url}?download=1`,
    });
  } catch {
    return Response.json({ error: "No se pudo publicar la fotografía" }, { status: 500 });
  }
}
