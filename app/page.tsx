"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Stage = "intro" | "camera" | "review" | "sending" | "done";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const TASKS_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm";

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLImageElement | null>(null);
  const backgroundRef = useRef<HTMLImageElement | null>(null);
  const subjectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const frameRef = useRef<number | null>(null);
  const returnTimerRef = useRef<number | null>(null);
  const lastBoxRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const facingRef = useRef<"user" | "environment">("user");
  const scaleRef = useRef(4.25);
  const verticalRef = useRef(0);

  const [stage, setStage] = useState<Stage>("intro");
  const [message, setMessage] = useState("Preparando el filtro…");
  const [cameraReady, setCameraReady] = useState(false);
  const [automatic, setAutomatic] = useState(true);
  const [scale, setScale] = useState(4.25);
  const [vertical, setVertical] = useState(0);
  const [photo, setPhoto] = useState("");
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    verticalRef.current = vertical;
  }, [vertical]);

  useEffect(() => {
    const image = new Image();
    image.src = "/toga-uts.png";
    overlayRef.current = image;
    const background = new Image();
    background.src = "/graduation-bg.png";
    backgroundRef.current = background;
    subjectCanvasRef.current = document.createElement("canvas");
    maskCanvasRef.current = document.createElement("canvas");
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (returnTimerRef.current) window.clearTimeout(returnTimerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      detectorRef.current?.close?.();
    };
  }, []);

  const loadDetector = useCallback(async () => {
    if (detectorRef.current) return;
    try {
      const dynamicImport = new Function("url", "return import(url)");
      const vision = await dynamicImport(TASKS_URL);
      const fileset = await vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm",
      );
      detectorRef.current = await vision.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.5,
      });
      setAutomatic(true);
    } catch {
      setAutomatic(false);
      setMessage("Ajusta la toga con los controles y toma la foto.");
    }
  }, []);

  const drawFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const background = backgroundRef.current;
    if (!video || !canvas || !overlay || !background || video.readyState < 2 || !overlay.complete || !background.complete) {
      frameRef.current = requestAnimationFrame(drawFrame);
      return;
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (detectorRef.current) {
      try {
        const result = detectorRef.current.detectForVideo(video, performance.now());
        const box = result?.detections?.[0]?.boundingBox;
        if (box) {
          const previous = lastBoxRef.current;
          const next = {
            x: box.originX,
            y: box.originY,
            width: box.width,
            height: box.height,
          };
          lastBoxRef.current = previous
            ? {
                x: previous.x * 0.8 + next.x * 0.2,
                y: previous.y * 0.8 + next.y * 0.2,
                width: previous.width * 0.8 + next.width * 0.2,
                height: previous.height * 0.8 + next.height * 0.2,
              }
            : next;
        }
      } catch {
        // The manual fallback remains available.
      }
    }

    const rawFace = lastBoxRef.current ?? {
      x: width * 0.38,
      y: height * 0.2,
      width: width * 0.24,
      height: height * 0.24,
    };
    // A front camera should behave like a natural mirror while composing the selfie.
    // Only the live person is reflected; the toga and institutional marks stay readable.
    const face = facingRef.current === "user"
      ? { ...rawFace, x: width - rawFace.x - rawFace.width }
      : rawFace;
    const overlayWidth = face.width * scaleRef.current;
    const overlayHeight = overlayWidth * 1.5;
    const faceCenterX = face.x + face.width / 2;
    const faceCenterY = face.y + face.height / 2;
    const overlayX = faceCenterX - overlayWidth / 2;
    const overlayY = faceCenterY - overlayHeight * 0.225 + verticalRef.current * height;

    // Draw a fixed graduation background, never the room behind the person.
    const bgRatio = Math.max(width / background.width, height / background.height);
    const bgWidth = background.width * bgRatio;
    const bgHeight = background.height * bgRatio;
    ctx.drawImage(background, (width - bgWidth) / 2, (height - bgHeight) / 2, bgWidth, bgHeight);

    // Preserve the sharp head and complete neck with a soft anatomical mask.
    // Its blurred edge blends naturally into the ceremony background, without an oval border.
    const subjectCanvas = subjectCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (subjectCanvas && maskCanvas) {
      if (subjectCanvas.width !== width || subjectCanvas.height !== height) {
        subjectCanvas.width = width;
        subjectCanvas.height = height;
        maskCanvas.width = width;
        maskCanvas.height = height;
      }
      const subjectCtx = subjectCanvas.getContext("2d");
      const maskCtx = maskCanvas.getContext("2d");
      if (subjectCtx && maskCtx) {
        const top = face.y - face.height * 0.38;
        const jaw = face.y + face.height * 1.08;
        const neckBottom = face.y + face.height * 2.18;
        const left = face.x - face.width * 0.25;
        const right = face.x + face.width * 1.25;
        const neckLeft = faceCenterX - face.width * 0.36;
        const neckRight = faceCenterX + face.width * 0.36;

        maskCtx.clearRect(0, 0, width, height);
        maskCtx.save();
        maskCtx.filter = `blur(${Math.max(5, face.width * 0.055)}px)`;
        maskCtx.fillStyle = "white";
        maskCtx.beginPath();
        maskCtx.moveTo(faceCenterX, top);
        maskCtx.bezierCurveTo(left, top, left, face.y + face.height * 0.7, faceCenterX - face.width * 0.48, jaw);
        maskCtx.lineTo(neckLeft, neckBottom);
        maskCtx.lineTo(neckRight, neckBottom);
        maskCtx.lineTo(faceCenterX + face.width * 0.48, jaw);
        maskCtx.bezierCurveTo(right, face.y + face.height * 0.7, right, top, faceCenterX, top);
        maskCtx.closePath();
        maskCtx.fill();
        maskCtx.restore();

        subjectCtx.clearRect(0, 0, width, height);
        subjectCtx.save();
        if (facingRef.current === "user") {
          subjectCtx.translate(width, 0);
          subjectCtx.scale(-1, 1);
        }
        subjectCtx.drawImage(video, 0, 0, width, height);
        subjectCtx.restore();
        subjectCtx.globalCompositeOperation = "destination-in";
        subjectCtx.drawImage(maskCanvas, 0, 0);
        subjectCtx.globalCompositeOperation = "source-over";
        ctx.drawImage(subjectCanvas, 0, 0);
      }
    }

    ctx.drawImage(overlay, overlayX, overlayY, overlayWidth, overlayHeight);

    frameRef.current = requestAnimationFrame(drawFrame);
  }, []);

  const startCamera = useCallback(async () => {
    setMessage("Solicitando permiso para usar la cámara…");
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingRef.current,
          width: { ideal: 1440 },
          height: { ideal: 1920 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setStage("camera");
      setCameraReady(true);
      setMessage("Centra tu rostro y ajusta la toga si lo necesitas.");
      await loadDetector();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(drawFrame);
    } catch {
      setCameraReady(false);
      setMessage("No pudimos abrir la cámara. Revisa el permiso del navegador e inténtalo nuevamente.");
    }
  }, [drawFrame, loadDetector]);

  const flipCamera = async () => {
    facingRef.current = facingRef.current === "user" ? "environment" : "user";
    lastBoxRef.current = null;
    await startCamera();
  };

  const downloadCapturedPhoto = (dataUrl: string) => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = (params.get("session") ?? "graduacion")
      .replace(/[^a-zA-Z0-9_-]/g, "-");
    const fileName = `foto-toga-uts-${sessionId}.jpg`;

    try {
      const [metadata, content] = dataUrl.split(",", 2);
      if (!content) throw new Error("Imagen sin contenido");
      const mimeType = metadata.match(/^data:([^;]+);base64$/)?.[1] ?? "image/jpeg";
      const decoded = window.atob(content);
      const bytes = new Uint8Array(decoded.length);
      for (let index = 0; index < decoded.length; index += 1) {
        bytes[index] = decoded.charCodeAt(index);
      }
      const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    } catch {
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  };

  const takePhoto = async () => {
    if (!cameraReady || countdown > 0) return;
    for (const value of [3, 2, 1]) {
      setCountdown(value);
      await new Promise((resolve) => window.setTimeout(resolve, 700));
    }
    setCountdown(0);
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    const canvas = canvasRef.current;
    if (!canvas) return;
    const maxWidth = 1440;
    const ratio = Math.min(1, maxWidth / canvas.width);
    const output = document.createElement("canvas");
    output.width = Math.round(canvas.width * ratio);
    output.height = Math.round(canvas.height * ratio);
    const outputContext = output.getContext("2d");
    if (!outputContext) return;
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = "high";
    outputContext.setTransform(1, 0, 0, 1, 0, 0);
    outputContext.drawImage(canvas, 0, 0, output.width, output.height);
    const capturedPhoto = output.toDataURL("image/jpeg", 0.93);
    setPhoto(capturedPhoto);
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    downloadCapturedPhoto(capturedPhoto);
    await sendPhoto(capturedPhoto);
  };

  const retake = () => {
    setPhoto("");
    setStage("camera");
    frameRef.current = requestAnimationFrame(drawFrame);
  };

  const returnToChat = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedReturn = params.get("return");
    const safeReturn = requestedReturn && /^https?:\/\//i.test(requestedReturn)
      ? requestedReturn
      : "";

    // If the camera was opened in a new tab/window, reveal the chat and close it.
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.focus();
      } catch {
        // Some browsers isolate the opener; closing can still work.
      }
      window.close();
      return;
    }

    // A return URL makes the fallback deterministic on browsers that block close().
    if (safeReturn) {
      window.location.replace(safeReturn);
      return;
    }

    // If the camera replaced the chat in the same tab, return through its history.
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    // Last attempt for a standalone tab. Browsers may require the user to close it.
    window.close();
  }, []);

  const publishPhoto = async (
    photoData: string,
    fileName: string,
    callback: string,
    sessionId: string,
  ) => {
    const photoResponse = await fetch(photoData);
    const photoBlob = await photoResponse.blob();
    const form = new FormData();
    form.append("file", photoBlob, fileName);
    form.append("callback", callback);
    form.append("sessionId", sessionId);

    const response = await fetch("/api/upload-photo", {
      method: "POST",
      body: form,
    });
    if (!response.ok) throw new Error("No se pudo publicar la fotografía");
    return await response.json() as { url: string; downloadUrl: string };
  };

  const sendPhoto = async (photoData = photo) => {
    const params = new URLSearchParams(window.location.search);
    const callback = params.get("callback");
    const sessionId = params.get("session") ?? "sin-sesion";
    const fileName = `foto-toga-uts-${sessionId.replace(/[^a-zA-Z0-9_-]/g, "-")}.jpg`;
    if (!callback || !/^https:\/\//i.test(callback)) {
      setStage("review");
      setMessage("Este enlace no tiene una dirección válida para regresar la foto a n8n.");
      return;
    }

    setStage("sending");
    setMessage("Preparando tu fotografía para el chat…");
    try {
      let hostedPhoto: { url?: string; downloadUrl?: string } = {};
      try {
        hostedPhoto = await publishPhoto(photoData, fileName, callback, sessionId);
      } catch {
        // The original Base64 image still reaches n8n if storage is unavailable.
      }

      setMessage("Enviando tu fotografía…");
      const response = await fetch(callback, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "success",
          sessionId,
          fileName,
          imageBase64: photoData,
          imageUrl: hostedPhoto.url ?? "",
          downloadUrl: hostedPhoto.downloadUrl ?? "",
        }),
      });
      if (!response.ok) throw new Error("No se pudo entregar la imagen");
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setStage("done");
      setMessage("Fotografía enviada. Volviendo al chat automáticamente…");
      returnTimerRef.current = window.setTimeout(returnToChat, 900);
    } catch {
      setStage("review");
      setMessage("No se pudo enviar la foto. Comprueba que el flujo de n8n siga esperando e inténtalo otra vez.");
    }
  };

  return (
    <main className="app-shell">
      <header className="brand-bar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo" src="/logo-uts-lime.png" alt="Logo UTS" />
        <div>
          <strong>UNIVERSITARIA TECNOLÓGICA DE SANTANDER</strong>
          <span>Foto de graduación</span>
        </div>
      </header>

      <section className="camera-card">
        {stage === "intro" && (
          <div className="intro">
            <div className="cap-icon" aria-hidden="true">◆</div>
            <p className="eyebrow">RECUERDO DE GRADUACIÓN</p>
            <h1>Tu foto con toga y birrete</h1>
            <p>Activa la cámara, mira al frente y el filtro se ajustará automáticamente. Después de la cuenta regresiva, la foto se descargará y se enviará sin pasos adicionales.</p>
            <div className="privacy-note">
              <span>✓</span>
              <p>La cámara solo se activa con tu permiso. Al pulsar el obturador, recibirás tu foto y se creará un enlace único para mostrarla en el chat.</p>
            </div>
            <button className="primary" onClick={startCamera}>Abrir cámara</button>
          </div>
        )}

        <div className={`camera-stage ${stage === "camera" ? "visible" : ""}`}>
          <video ref={videoRef} playsInline muted aria-hidden="true" />
          <canvas ref={canvasRef} aria-label="Vista previa de cámara con toga y birrete" />
          {countdown > 0 && <div className="countdown" aria-live="assertive">{countdown}</div>}
          <button className="flip" onClick={flipCamera} aria-label="Cambiar cámara">↻</button>
          <div className="camera-controls">
            <p>{automatic ? "Tracker activo · Movimiento natural" : "Ajuste manual · Movimiento natural"}</p>
            <label>
              Tamaño
              <input type="range" min="3.6" max="5.6" step="0.05" value={scale} onChange={(event) => setScale(Number(event.target.value))} />
            </label>
            <label>
              Altura
              <input type="range" min="-0.18" max="0.18" step="0.01" value={vertical} onChange={(event) => setVertical(Number(event.target.value))} />
            </label>
            <button className="shutter" onClick={takePhoto} disabled={!cameraReady || countdown > 0} aria-label="Tomar foto"><span /></button>
          </div>
        </div>

        {stage === "review" && (
          <div className="review">
            <p className="eyebrow">NO SE PUDO ENVIAR</p>
            <h1>Revisa la conexión</h1>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="Fotografía tomada con toga y birrete" />
            <p>{message}</p>
            <div className="review-actions">
              <button className="secondary" onClick={retake}>Repetir</button>
              <button className="primary" onClick={() => sendPhoto()}>Reintentar envío</button>
            </div>
          </div>
        )}

        {(stage === "sending" || stage === "done") && (
          <div className="result">
            <div className={stage === "done" ? "success" : "loader"}>{stage === "done" ? "✓" : ""}</div>
            <h1>{stage === "done" ? "¡Todo listo!" : "Un momento…"}</h1>
            <p>{message}</p>
            {stage === "done" && (
              <button className="primary return-button" onClick={returnToChat}>Volver al chat ahora</button>
            )}
          </div>
        )}

        {stage !== "intro" && stage !== "done" && <p className="status" role="status">{message}</p>}
      </section>

      <footer>Universitaria Tecnológica de Santander · UTS</footer>
    </main>
  );
}
