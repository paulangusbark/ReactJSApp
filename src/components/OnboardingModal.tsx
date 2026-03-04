import * as React from "react";
import { createPortal } from "react-dom";

type Slide = {
  title: string;
  body: React.ReactNode;
};

const SLIDES: Slide[] = [
  {
    title: "Welcome to Cointrol",
    body: (
      <>
        <p className="text-sm text-muted-foreground leading-relaxed">
          This is a demonstration wallet running on{" "}
          <strong>Ethereum Sepolia testnet</strong>. All coins and transactions
          are for testing purposes only and have no real monetary value.
        </p>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          This guide will walk you through the key features of your wallet.
        </p>
      </>
    ),
  },
  {
    title: "Create your first account",
    body: (
      <p className="text-sm text-muted-foreground leading-relaxed">
        Tap the <strong>+</strong> button on the Portfolio screen to create your
        first account (called a <em>folio</em>). Each folio is a smart-contract
        wallet on the blockchain. You can give it any name you like.
      </p>
    ),
  },
  {
    title: "Name your portfolio",
    body: (
      <p className="text-sm text-muted-foreground leading-relaxed">
        Once your account is created, tap the account name to edit it. A clear
        display name (such as your first name) makes it easy to identify
        yourself when sharing your profile with others.
      </p>
    ),
  },
  {
    title: "Share your profile",
    body: (
      <p className="text-sm text-muted-foreground leading-relaxed">
        Use the <strong>Share</strong> button on your Portfolio screen to
        generate a QR code. Others can scan it to add your address as a contact
        instantly — no typing required.
      </p>
    ),
  },
];

export function OnboardingModal({
  open,
  onDismiss,
}: {
  open: boolean;
  onDismiss: () => void;
}) {
  const [slide, setSlide] = React.useState(0);

  // Reset to first slide whenever the modal opens
  React.useEffect(() => {
    if (open) setSlide(0);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const isFirst = slide === 0;
  const isLast = slide === SLIDES.length - 1;
  const current = SLIDES[slide];

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
        }}
        className="bg-background border border-border"
      >
        {/* Slide counter dots */}
        <div className="flex justify-center gap-1.5 mb-5">
          {SLIDES.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === slide
                  ? "w-5 bg-primary"
                  : "w-1.5 bg-border"
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <h2 className="text-lg font-semibold text-foreground mb-3">
          {current.title}
        </h2>
        <div className="mb-6">{current.body}</div>

        {/* Action buttons */}
        <div className="flex items-center justify-between gap-2">
          {/* Left: Skip (always) or Back (non-first slides) */}
          {isFirst ? (
            <button
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={onDismiss}
            >
              Skip
            </button>
          ) : (
            <button
              className="rounded-md border border-border px-3 py-1.5 text-xs"
              onClick={() => setSlide(s => s - 1)}
            >
              Back
            </button>
          )}

          {/* Right: Next or Done */}
          {isLast ? (
            <button
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground"
              onClick={onDismiss}
            >
              Done
            </button>
          ) : (
            <button
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground"
              onClick={() => setSlide(s => s + 1)}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
