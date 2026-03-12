import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { Lock } from "lucide-react";

export default function ResetPassword() {
  const [token, setToken] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    const err = params.get("error");
    if (err === "INVALID_TOKEN") {
      toast.error("This reset link is invalid or has expired");
      setUrlError(err);
    }
    setToken(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newPassword) {
      toast.error("Enter a new password");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const result = (await authClient.$fetch("/reset-password", {
        method: "POST",
        body: {
          newPassword,
          token,
        },
      })) as { error?: { message?: string } };
      if (result.error) {
        toast.error(result.error.message ?? "Failed to reset password");
        return;
      }
      setSuccess(true);
      toast.success("Password reset. You can sign in now.");
    } finally {
      setLoading(false);
    }
  };

  if (!token && !urlError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-2xl font-bold">Reset password</h1>
          <p className="text-muted-foreground text-sm">
            Use the link from your email to reset your password. Links expire after a short time.
          </p>
          <Link to="/sign-in" className="text-primary underline hover:no-underline">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  if (urlError === "INVALID_TOKEN") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-2xl font-bold">Invalid or expired link</h1>
          <p className="text-muted-foreground text-sm">
            This password reset link is invalid or has expired. Request a new one from the sign-in page.
          </p>
          <Link to="/sign-in" className="text-primary underline hover:no-underline">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-2xl font-bold">Password reset</h1>
          <p className="text-muted-foreground text-sm">Your password has been updated. You can now sign in.</p>
          <Button asChild>
            <Link to="/sign-in">Sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Set new password</h1>
          <p className="text-muted-foreground text-sm mt-1">Enter your new password below.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-foreground mb-1.5">
              New password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} />
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Resetting…" : "Reset password"}
          </Button>
        </form>
        <p className="text-center">
          <Link to="/sign-in" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
