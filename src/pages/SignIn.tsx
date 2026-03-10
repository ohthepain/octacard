import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, signIn, signUp } from "@/lib/auth-client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getCurrentPack } from "@/lib/current-pack";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Mail, ArrowRight } from "lucide-react";

const OCTACARD_DESCRIPTION =
  "Sample manager and organizer for Elektron Octatrack. Import, convert, and manage your samples.";

export default function SignIn() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [tab, setTab] = useState<"password" | "magic">("password");
  const [currentPack, setCurrentPackState] = useState<{ name: string } | null>(null);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);

  useEffect(() => {
    setCurrentPackState(getCurrentPack());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "sign-in") {
        if (tab === "password") {
          const result = await signIn.email({ email, password });
          if (result.error) {
            toast.error(result.error.message ?? "Sign in failed");
            return;
          }
          toast.success("Signed in");
          window.location.href = "/";
        } else {
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
        }
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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotPasswordEmail.trim()) {
      toast.error("Enter your email");
      return;
    }
    setForgotPasswordLoading(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const result = await authClient.requestPasswordReset({
        email: forgotPasswordEmail.trim(),
        redirectTo,
      });
      if (result.error) {
        toast.error(result.error.message ?? "Failed to send reset link");
        return;
      }
      setForgotPasswordSent(true);
      toast.success("Check your email for the reset link");
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const result = await signIn.social({
        provider: "google",
        callbackURL: "/",
      });
      if (result.error) {
        toast.error(result.error.message ?? "Google sign in failed");
      }
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
              ← Back to Octacard
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const introSubline = currentPack ? currentPack.name : "Octacard";
  const showDescription = !currentPack;

  return (
    <div className="min-h-screen w-full flex">
      {/* Intro frame - left panel */}
      <div className="hidden lg:flex lg:w-1/3 flex-col justify-between p-12 relative overflow-hidden bg-gray-950">
        {/* Decorative circles */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-5 bg-white" />
        <div className="absolute -bottom-32 -right-16 size-[28rem] rounded-full opacity-5 bg-white" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <img src="/favicon.png" alt="" className="w-10 h-10 rounded-xl" aria-hidden />
          <span className="text-white font-semibold text-lg tracking-wide">Octacard</span>
        </div>

        {/* Main copy */}
        <div className="relative z-10">
          <h1 className="text-white mb-4" style={{ fontSize: "2.5rem", fontWeight: 700, lineHeight: 1.2 }}>
            {mode === "sign-in" ? "Welcome back to" : "Get started with"}
            <br />
            <span className="text-gray-400">{introSubline}</span>
          </h1>
          {showDescription && (
            <p className="text-gray-400 max-w-xs" style={{ lineHeight: 1.6 }}>
              {OCTACARD_DESCRIPTION}
            </p>
          )}
        </div>

        {/* TOS & Privacy links */}
        <div className="relative z-10 flex gap-4 text-sm">
          <Link
            to="/legal/terms"
            className="text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2"
          >
            Terms of Service
          </Link>
          <Link
            to="/legal/privacy"
            className="text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2"
          >
            Privacy Policy
          </Link>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 mb-10">
            <img src="/favicon.png" alt="" className="w-9 h-9 rounded-xl" aria-hidden />
            <span className="font-semibold text-lg text-foreground">Octacard</span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-foreground mb-2" style={{ fontSize: "1.875rem", fontWeight: 700 }}>
              {mode === "sign-in" ? "Sign in" : "Create account"}
            </h2>
            <p className="text-muted-foreground">
              {mode === "sign-in" ? (
                <>
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    className="font-medium text-foreground underline"
                    onClick={() => setMode("sign-up")}
                  >
                    Register
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    className="font-medium text-foreground underline"
                    onClick={() => setMode("sign-in")}
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </div>

          {mode === "sign-in" && (
            <>
              {/* Passkey button */}
              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 border border-border rounded-xl py-3 text-muted-foreground text-sm font-medium hover:bg-muted/50 transition-colors mb-6 cursor-not-allowed opacity-70"
                disabled
                title="Coming soon"
              >
                <span>🔑</span> Sign in with Passkey
              </button>

              {/* Divider */}
              <div className="flex items-center gap-4 mb-6">
                <div className="flex-1 h-px bg-border" />
                <span className="text-muted-foreground text-sm">or continue with email</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Tab toggle */}
              <div className="flex rounded-xl bg-muted p-1 gap-1 mb-6">
                <button
                  type="button"
                  onClick={() => setTab("password")}
                  className="flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all"
                  style={{
                    backgroundColor: tab === "password" ? "hsl(var(--primary))" : "transparent",
                    color: tab === "password" ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                  }}
                >
                  Password
                </button>
                <button
                  type="button"
                  onClick={() => setTab("magic")}
                  className="flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all"
                  style={{
                    backgroundColor: tab === "magic" ? "hsl(var(--primary))" : "transparent",
                    color: tab === "magic" ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                  }}
                >
                  Magic Link
                </button>
              </div>
            </>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === "sign-up" && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
                <div className="relative">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                    className="w-full pl-4 pr-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-all"
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-all"
                />
              </div>
            </div>

            {/* Password (hidden on Magic Link tab when sign-in) */}
            {(mode === "sign-up" || (mode === "sign-in" && tab === "password")) && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-foreground">Password</label>
                  {mode === "sign-in" && tab === "password" && (
                    <button
                      type="button"
                      onClick={() => setForgotPasswordOpen(true)}
                      className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 ml-auto"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required={mode === "sign-up" || tab === "password"}
                    autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                    minLength={mode === "sign-up" ? 8 : undefined}
                    className="w-full pl-10 pr-11 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-primary-foreground font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-70 bg-primary"
            >
              {loading ? (
                <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              ) : mode === "sign-in" && tab === "magic" ? (
                <>
                  <span>Send Magic Link</span>
                  <ArrowRight size={16} />
                </>
              ) : (
                <>
                  <span>{mode === "sign-in" ? "Sign in" : "Create account"}</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {mode === "sign-in" && (
            <>
              <div className="flex gap-2 mt-6">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                >
                  Continue with Google
                </Button>
              </div>
              <div className="mt-4 space-y-2">
                <Button type="button" variant="outline" className="w-full" onClick={handleSendOtp} disabled={loading}>
                  Send OTP code
                </Button>
                {otpSent && (
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="123456"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      className="flex-1"
                    />
                    <Button type="button" onClick={handleOtpSignIn} disabled={loading}>
                      Sign in with OTP
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}

          <p className="text-center text-xs text-muted-foreground mt-8">
            By signing in, you agree to our{" "}
            <Link to="/legal/terms" className="underline hover:text-foreground">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link to="/legal/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </Link>
            .
          </p>

          <p className="text-center mt-4">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
              ← Back to Octacard
            </Link>
          </p>

          {/* Forgot password dialog */}
          <Dialog
            open={forgotPasswordOpen}
            onOpenChange={(open) => {
              setForgotPasswordOpen(open);
              if (!open) {
                setForgotPasswordEmail("");
                setForgotPasswordSent(false);
              }
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Forgot password</DialogTitle>
                <DialogDescription>
                  {forgotPasswordSent
                    ? "We sent a reset link to your email. Check your inbox and spam folder."
                    : "Enter your email and we'll send you a link to reset your password."}
                </DialogDescription>
              </DialogHeader>
              {!forgotPasswordSent ? (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                    <input
                      type="email"
                      value={forgotPasswordEmail}
                      onChange={(e) => setForgotPasswordEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      autoComplete="email"
                      className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={forgotPasswordLoading}>
                    {forgotPasswordLoading ? "Sending…" : "Send reset link"}
                  </Button>
                </form>
              ) : (
                <Button variant="outline" onClick={() => setForgotPasswordOpen(false)}>
                  Close
                </Button>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
