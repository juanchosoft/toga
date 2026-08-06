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
                x: previous.x * 0.72 + next.x * 0.28,
                y: previous.y * 0.72 + next.y * 0.28,
                width: previous.width * 0.72 + next.width * 0.28,
                height: previous.height * 0.72 + next.height * 0.28,
              }
            : next;
        }
      } catch {
        // The manual fallback remains available.
      }
    }

    const face = lastBoxRef.current ?? {
      x: width * 0.38,
      y: height * 0.2,
      width: width * 0.24,
      height: height * 0.24,
    };
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
        const top = face.y - face.height * 0.42;
        const jaw = face.y + face.height * 1.12;
        const neckBottom = face.y + face.height * 2.05;
        const left = face.x - face.width * 0.34;
        const right = face.x + face.width * 1.34;
        const neckLeft = faceCenterX - face.width * 0.34;
        const neckRight = faceCenterX + face.width * 0.34;

        maskCtx.clearRect(0, 0, width, height);
        maskCtx.save();
        maskCtx.filter = `blur(${Math.max(8, face.width * 0.1)}px)`;
        maskCtx.fillStyle = "white";
        maskCtx.beginPath();
        maskCtx.moveTo(faceCenterX, top);
        maskCtx.bezierCurveTo(left, top, left, face.y + face.height * 0.7, faceCenterX - face.width * 0.48, jaw);
        maskCtx.lineTo(neckLeft, neckBottom);
        maskCtx.lineTo(faceCenterX - face.width * 0.92, neckBottom + face.height * 0.35);
        maskCtx.lineTo(faceCenterX + face.width * 0.92, neckBottom + face.height * 0.35);
        maskCtx.lineTo(neckRight, neckBottom);
        maskCtx.lineTo(faceCenterX + face.width * 0.48, jaw);
        maskCtx.bezierCurveTo(right, face.y + face.height * 0.7, right, top, faceCenterX, top);
        maskCtx.closePath();
        maskCtx.fill();
        maskCtx.restore();

        subjectCtx.clearRect(0, 0, width, height);
        // Intentionally unmirrored: the face and institutional marks remain correctly oriented.
        subjectCtx.drawImage(video, 0, 0, width, height);
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
          width: { ideal: 1080 },
          height: { ideal: 1440 },
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

  const takePhoto = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const maxWidth = 1080;
    const ratio = Math.min(1, maxWidth / canvas.width);
    const output = document.createElement("canvas");
    output.width = Math.round(canvas.width * ratio);
    output.height = Math.round(canvas.height * ratio);
    output.getContext("2d")?.drawImage(canvas, 0, 0, output.width, output.height);
    setPhoto(output.toDataURL("image/jpeg", 0.86));
    setStage("review");
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  };

  const retake = () => {
    setPhoto("");
    setStage("camera");
    frameRef.current = requestAnimationFrame(drawFrame);
  };

  const sendPhoto = async () => {
    const params = new URLSearchParams(window.location.search);
    const callback = params.get("callback");
    const sessionId = params.get("session") ?? "sin-sesion";
    if (!callback || !/^https:\/\//i.test(callback)) {
      setMessage("Este enlace no tiene una dirección válida para regresar la foto a n8n.");
      return;
    }

    setStage("sending");
    setMessage("Enviando tu fotografía…");
    try {
      const response = await fetch(callback, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "success", sessionId, imageBase64: photo }),
      });
      if (!response.ok) throw new Error("No se pudo entregar la imagen");
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setStage("done");
      setMessage("Fotografía enviada. Ya puedes volver al chat.");
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
            <p>Activa la cámara, mira al frente y el filtro se ajustará automáticamente. Podrás repetir la foto antes de enviarla.</p>
            <div className="privacy-note">
              <span>✓</span>
              <p>La cámara solo se activa con tu permiso. La foto se enviará al flujo de n8n cuando pulses <b>Usar esta foto</b>.</p>
            </div>
            <button className="primary" onClick={startCamera}>Abrir cámara</button>
          </div>
        )}

        <div className={`camera-stage ${stage === "camera" ? "visible" : ""}`}>
          <video ref={videoRef} playsInline muted aria-hidden="true" />
          <canvas ref={canvasRef} aria-label="Vista previa de cámara con toga y birrete" />
          <button className="flip" onClick={flipCamera} aria-label="Cambiar cámara">↻</button>
          <div className="camera-controls">
            <p>{automatic ? "Filtro automático activo" : "Ajuste manual activo"}</p>
            <label>
              Tamaño
              <input type="range" min="3.6" max="5.6" step="0.05" value={scale} onChange={(event) => setScale(Number(event.target.value))} />
            </label>
            <label>
              Altura
              <input type="range" min="-0.18" max="0.18" step="0.01" value={vertical} onChange={(event) => setVertical(Number(event.target.value))} />
            </label>
            <button className="shutter" onClick={takePhoto} disabled={!cameraReady} aria-label="Tomar foto"><span /></button>
          </div>
        </div>

        {stage === "review" && (
          <div className="review">
            <p className="eyebrow">REVISA TU FOTO</p>
            <h1>¿Te gusta cómo quedó?</h1>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="Fotografía tomada con toga y birrete" />
            <div className="review-actions">
              <button className="secondary" onClick={retake}>Repetir</button>
              <button className="primary" onClick={sendPhoto}>Usar esta foto</button>
            </div>
          </div>
        )}

        {(stage === "sending" || stage === "done") && (
          <div className="result">
            <div className={stage === "done" ? "success" : "loader"}>{stage === "done" ? "✓" : ""}</div>
            <h1>{stage === "done" ? "¡Todo listo!" : "Un momento…"}</h1>
            <p>{message}</p>
          </div>
        )}

        {stage !== "intro" && stage !== "done" && <p className="status" role="status">{message}</p>}
      </section>

      <footer>Universitaria Tecnológica de Santander · UTS</footer>
    </main>
  );
}
