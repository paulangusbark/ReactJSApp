import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Github, Facebook, Twitter } from "lucide-react";
import { toast } from "sonner";
import {
  signInWithRedirect,
  getRedirectResult,
  type AuthProvider,
} from "firebase/auth";
import {
  auth,
  googleProvider,
  facebookProvider,
  twitterProvider,
  githubProvider,
  // appleProvider, // Uncomment to add Apple Sign-In (also uncomment the button below)
} from "../firebase";
import { useAuth } from "../context/AuthContext";
import { isFirstTimeUser, setTermsAccepted } from "../storage/authStore";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import logo from "../assets/logo.png";

export function LoginPage() {
  const { firebaseUser } = useAuth();
  const navigate = useNavigate();

  const [firstTime, setFirstTime] = useState<boolean | null>(null);
  const [termsChecked, setTermsChecked] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  // Determine first-time vs returning on mount
  useEffect(() => {
    isFirstTimeUser().then(setFirstTime);
  }, []);

  // If already authenticated (e.g. after a redirect or returning session), go straight to dashboard
  useEffect(() => {
    if (firebaseUser) navigate("/dashboard", { replace: true });
  }, [firebaseUser, navigate]);

  // Handle redirect result — fires after Google redirects back to the app
  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (result?.user) {
          await setTermsAccepted();
          navigate("/dashboard", { replace: true });
        }
      })
      .catch(console.error);
  }, []);

  const signIn = async (provider: AuthProvider) => {
    if (signingIn) return;
    setSigningIn(true);
    try {
      // Use redirect flow — more reliable than popup across all browsers (especially Firefox)
      await signInWithRedirect(auth, provider);
      // Page will navigate away; execution does not continue here
    } catch (e: any) {
      console.error("[Login] signInWithRedirect error:", e);
      toast.error((e as any)?.message ?? "Sign-in failed. Please try again.");
      setSigningIn(false);
    }

  };

  const buttonsDisabled = signingIn || (firstTime === true && !termsChecked);

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <img src={logo} alt="Cointrol Wallet" style={{ height: 56, width: "auto" }} />
        </div>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-center text-xl">Sign in to QuantumAccount</CardTitle>
          </CardHeader>

          <CardContent className="space-y-3 pt-2">
            {/* Loading state while we check IndexedDB */}
            {firstTime === null ? (
              <div className="text-center text-sm text-muted-foreground py-4">Loading…</div>
            ) : (
              <>
                {/* First-time T&C acceptance */}
                {firstTime && (
                  <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Before creating your wallet, please review and accept our{" "}
                      <Link
                        to="/legal/terms"
                        className="underline underline-offset-2 text-foreground"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Terms &amp; Conditions
                      </Link>
                      .
                    </p>
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={termsChecked}
                        onChange={(e) => setTermsChecked(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-border accent-foreground cursor-pointer"
                      />
                      <span className="text-sm leading-snug">
                        I have read and agree to the Terms &amp; Conditions
                      </span>
                    </label>
                  </div>
                )}

                {/* Sign-in buttons */}
                <div className="space-y-4 pt-2">
                  <Button
                    className="w-full gap-2 h-12 text-base"
                    disabled={buttonsDisabled}
                    onClick={() => signIn(googleProvider)}
                  >
                    {/* Google uses a styled text mark — no lucide icon available */}
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-bold text-neutral-800 leading-none">
                      G
                    </span>
                    Continue with Google
                  </Button>

                  <Button
                    className="w-full gap-2 h-12 text-base"
                    variant="secondary"
                    disabled={buttonsDisabled}
                    onClick={() => signIn(facebookProvider)}
                  >
                    <Facebook className="h-5 w-5" />
                    Continue with Facebook
                  </Button>

                  <Button
                    className="w-full gap-2 h-12 text-base"
                    variant="secondary"
                    disabled={buttonsDisabled}
                    onClick={() => signIn(twitterProvider)}
                  >
                    <Twitter className="h-5 w-5" />
                    Continue with X (Twitter)
                  </Button>

                  <Button
                    className="w-full gap-2 h-12 text-base"
                    variant="outline"
                    disabled={buttonsDisabled}
                    onClick={() => signIn(githubProvider)}
                  >
                    <Github className="h-5 w-5" />
                    Continue with GitHub
                  </Button>

                  {/*
                    Apple Sign-In — uncomment once:
                      1. appleProvider is exported from firebase.ts
                      2. Apple Sign-In is enabled in the Firebase console
                      3. Your Apple Developer service ID and key are configured

                  <Button
                    className="w-full gap-2"
                    variant="outline"
                    disabled={buttonsDisabled}
                    onClick={() => signIn(appleProvider)}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 814 1000" fill="currentColor">
                      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105.3-57.8-155.5-127.4C46 790.7 0 663 0 541.8c0-207.8 135.5-317.6 269-317.6 70.6 0 127.4 46.3 167.1 46.3 42.8 0 109.2-49.2 186.1-49.2 29.8 0 130.3 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/>
                    </svg>
                    Continue with Apple
                  </Button>
                  */}
                </div>

                {firstTime && (
                  <p className="text-center text-xs text-muted-foreground pt-1">
                    First time? A unique wallet identifier will be generated for your device.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          <Link to="/legal/privacy" className="underline underline-offset-2">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}
