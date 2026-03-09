import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, signIn, signUp } from "@/lib/auth-client";
import { toast } from "sonner";

export default function SignIn() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "sign-in") {
        const result = await signIn.email({ email, password });
        if (result.error) {
          toast.error(result.error.message ?? "Sign in failed");
          return;
        }
        toast.success("Signed in");
        window.location.href = "/";
      } else {
        const result = await signUp.email({ email, password, name: name || email });
        if (result.error) {
          toast.error(result.error.message ?? "Sign up failed");
          return;
        }
        toast.success("Account created. Check your email for the verification code.");
        setNeedsVerification(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !otp) {
      toast.error("Enter the verification code from your email");
      return;
    }
    setLoading(true);
    try {
      const result = await authClient.emailOtp.verifyEmail({ email, otp });
      if (result.error) {
        toast.error(result.error.message ?? "Verification failed");
        return;
      }
      toast.success("Email verified");
      window.location.href = "/";
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email) {
      toast.error("Enter your email first");
      return;
    }
    setLoading(true);
    try {
      const result = await authClient.$fetch("/sign-in/magic-link", {
        method: "POST",
        body: {
          email,
          callbackURL: "/",
        },
      });
      if (result.error) {
        toast.error(result.error.message ?? "Magic link failed");
        return;
      }
      toast.success("Magic link sent");
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    if (!email) {
      toast.error("Enter your email first");
      return;
    }
    setLoading(true);
    try {
      const result = await authClient.$fetch("/email-otp/send-verification-otp", {
        method: "POST",
        body: {
          email,
          type: "sign-in",
        },
      });
      if (result.error) {
        toast.error(result.error.message ?? "Failed to send OTP");
        return;
      }
      setOtpSent(true);
      toast.success("OTP sent");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSignIn = async () => {
    if (!email || !otp) {
      toast.error("Enter email and OTP");
      return;
    }
    setLoading(true);
    try {
      const result = await authClient.$fetch("/sign-in/email-otp", {
        method: "POST",
        body: {
          email,
          otp,
        },
      });
      if (result.error) {
        toast.error(result.error.message ?? "OTP sign in failed");
        return;
      }
      toast.success("Signed in");
      window.location.href = "/";
    } finally {
      setLoading(false);
    }
  };

  if (needsVerification) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Verify your email</h1>
            <p className="text-muted-foreground text-sm mt-1">
              We sent a verification code to {email}. Enter it below.
            </p>
          </div>
          <form onSubmit={handleVerifyEmail} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="verify-otp">Verification code</Label>
              <Input
                id="verify-otp"
                type="text"
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Verifying…" : "Verify email"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            <button
              type="button"
              className="text-primary underline hover:no-underline"
              onClick={() => setNeedsVerification(false)}
            >
              Back to sign up
            </button>
          </p>
          <p className="text-center">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
              ← Back to OctaCard
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">{mode === "sign-in" ? "Sign in" : "Create account"}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {mode === "sign-in" ? "Welcome back to OctaCard" : "Get started with OctaCard"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "sign-up" && (
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              minLength={8}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
          </Button>
          {mode === "sign-in" && (
            <>
              <Button type="button" variant="outline" className="w-full" onClick={handleMagicLink} disabled={loading}>
                Send magic link
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={handleSendOtp} disabled={loading}>
                Send OTP code
              </Button>
              {otpSent && (
                <div className="space-y-2">
                  <Label htmlFor="otp">One-time code</Label>
                  <Input
                    id="otp"
                    type="text"
                    placeholder="123456"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                  />
                  <Button type="button" className="w-full" onClick={handleOtpSignIn} disabled={loading}>
                    Sign in with OTP
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center">
                Passkey support is planned next.
              </p>
            </>
          )}
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {mode === "sign-in" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                className="text-primary underline hover:no-underline"
                onClick={() => setMode("sign-up")}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className="text-primary underline hover:no-underline"
                onClick={() => setMode("sign-in")}
              >
                Sign in
              </button>
            </>
          )}
        </p>

        <p className="text-center text-xs text-muted-foreground">
          By signing in, you agree to our{" "}
          <Link to="/legal/terms" className="underline hover:no-underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link to="/legal/privacy" className="underline hover:no-underline">
            Privacy Policy
          </Link>
          .
        </p>

        <p className="text-center">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to OctaCard
          </Link>
        </p>
      </div>
    </div>
  );
}
