import * as React from "react";
import { createPortal } from "react-dom";
import QRCode from "react-qr-code";
import { encodeSharePayload } from "@/lib/sharePayload";
import type { SharePayload } from "@/lib/sharePayload";
import logo from "@/assets/logo.png";

const QR_CHAR_LIMIT = 2800;
const QR_SIZE = 240;

export function ShareQrModal({
  payload,
  onClose,
}: {
  payload: SharePayload;
  onClose: () => void;
}) {
  const value = encodeSharePayload(payload);
  const tooLarge = value.length > QR_CHAR_LIMIT;
  const qrWrapperRef = React.useRef<HTMLDivElement>(null);
  const [copyState, setCopyState] = React.useState<"idle" | "copied" | "error">("idle");

  async function handleCopyQr() {
    const wrapper = qrWrapperRef.current;
    if (!wrapper) return;
    const svgEl = wrapper.querySelector("svg");
    if (!svgEl) return;

    try {
      const svgString = new XMLSerializer().serializeToString(svgEl);
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.src = url;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
      });

      const canvas = document.createElement("canvas");
      canvas.width = QR_SIZE;
      canvas.height = QR_SIZE;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, QR_SIZE, QR_SIZE);
      ctx.drawImage(img, 0, 0, QR_SIZE, QR_SIZE);
      URL.revokeObjectURL(url);

      const pngBlob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png")
      );

      if (navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(pngBlob);
        a.download = "cointrol-qr.png";
        a.click();
      }

      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 2000);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2147483646,
          background: "rgba(0,0,0,0.35)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
      />

      {/* Modal panel */}
      <div
        role="dialog"
        aria-modal="true"
        className="
          rounded-2xl
          border border-neutral-200
          bg-[#fffdf7]
          text-neutral-900
          shadow-2xl
        "
        style={{
          position: "fixed",
          zIndex: 2147483647,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(420px, calc(100vw - 32px))",
          padding: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-lg font-semibold mb-3 text-center">Share {payload.t}: {payload.data.name}</div>

        {/* QR box */}
        <div className="mt-2 flex justify-center">
          {tooLarge ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 max-w-xs text-center">
              This contract&apos;s data is too large to encode as a QR code, even after stripping the ABI. Try reducing the amount of metadata stored on this contract.
            </div>
          ) : (
            <div
              ref={qrWrapperRef}
              className="bg-white p-3 rounded-lg border shadow-sm"
              style={{ position: "relative", display: "inline-block" }}
            >
              <QRCode value={value} size={QR_SIZE} level="H" />
              <img
                src={logo}
                alt=""
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 48,
                  height: 48,
                  objectFit: "contain",
                  borderRadius: 6,
                  background: "white",
                  padding: 2,
                }}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-4 flex justify-between items-center">
          <button
            type="button"
            className="rounded bg-neutral-100 border border-neutral-300 px-3 py-2 text-sm text-neutral-800 disabled:opacity-50"
            onClick={handleCopyQr}
            disabled={tooLarge || copyState !== "idle"}
          >
            {copyState === "copied" ? "Copied!" : copyState === "error" ? "Failed" : "Copy QR"}
          </button>

          <button
            type="button"
            className="rounded bg-black px-3 py-2 text-white"
            onClick={onClose}
          >
            Close
          </button>
        </div>

      </div>
    </>,
    document.body
  );
}
