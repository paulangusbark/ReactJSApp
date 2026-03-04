import React from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";

export function QrScanner({
  onDecoded,
}: {
  onDecoded: (payload: string) => void;
}) {
  const [mode, setMode] = React.useState<"camera" | "image">("camera");
  const [imageError, setImageError] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const controlsRef = React.useRef<IScannerControls | null>(null);
  const stoppedRef = React.useRef(false);

  // Start/stop camera based on mode
  React.useEffect(() => {
    if (mode !== "camera") return;

    stoppedRef.current = false;
    const reader = new BrowserMultiFormatReader();

    (async () => {
      const video = videoRef.current;
      if (!video) return;

      controlsRef.current = await reader.decodeFromVideoDevice(
        undefined,
        video,
        (result) => {
          if (stoppedRef.current) return;
          if (result) {
            stoppedRef.current = true;
            controlsRef.current?.stop();
            onDecoded(result.getText());
          }
        }
      );
    })();

    return () => {
      stoppedRef.current = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [mode, onDecoded]);

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageError(null);

    try {
      const url = URL.createObjectURL(file);
      const img = document.createElement("img");
      img.src = url;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Could not load image"));
      });

      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageElement(img);
      URL.revokeObjectURL(url);
      onDecoded(result.getText());
    } catch {
      setImageError("No QR code found in this image. Please try another.");
    }

    // Reset input so the same file can be retried after an error
    e.target.value = "";
  }

  return (
    <div className="p-4 space-y-3">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          className={`flex-1 rounded-md border px-3 py-1.5 text-xs ${mode === "camera" ? "bg-primary text-primary-foreground border-primary" : "border-border bg-background"}`}
          onClick={() => { setMode("camera"); setImageError(null); }}
        >
          Use camera
        </button>
        <button
          type="button"
          className={`flex-1 rounded-md border px-3 py-1.5 text-xs ${mode === "image" ? "bg-primary text-primary-foreground border-primary" : "border-border bg-background"}`}
          onClick={() => { setMode("image"); setImageError(null); }}
        >
          Scan image
        </button>
      </div>

      {mode === "camera" && (
        <>
          <video ref={videoRef} className="w-full rounded-lg" />
          <div className="text-xs text-neutral-500">Point your camera at a QR code.</div>
        </>
      )}

      {mode === "image" && (
        <>
          <label className="flex flex-col items-center justify-center w-full rounded-lg border-2 border-dashed border-border bg-background p-6 cursor-pointer hover:bg-muted text-center gap-2">
            <span className="text-sm text-foreground">Choose an image containing a QR code</span>
            <span className="text-xs text-muted-foreground">JPEG, PNG, WebP, GIF…</span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleImageFile}
            />
          </label>
          {imageError && (
            <div className="text-xs text-red-600">{imageError}</div>
          )}
        </>
      )}
    </div>
  );
}
