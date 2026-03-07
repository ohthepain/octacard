import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useSession, deleteUser, signOut } from "@/lib/auth-client";
import { toast } from "sonner";
import { useState } from "react";
import { ShieldAlert, Trash2 } from "lucide-react";

export default function Legal() {
  const { data: session } = useSession();
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const result = await deleteUser();
      if (result.error) {
        toast.error(result.error.message ?? "Failed to delete account");
        return;
      }
      await signOut();
      toast.success("Account deleted");
      window.location.href = "/";
    } catch (err) {
      toast.error("Something went wrong");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <Link to="/" className="text-lg font-semibold">
            OctaCard
          </Link>
          <Link to="/">
            <Button variant="ghost" size="sm">
              Back
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-12">
        <div>
          <h1 className="text-2xl font-bold">Legal & Privacy</h1>
          <p className="text-muted-foreground mt-1">
            Terms of Service, Privacy Policy, and your data rights.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Documents</h2>
          <ul className="space-y-2">
            <li>
              <Link
                to="/legal/terms"
                className="text-primary hover:underline font-medium"
              >
                Terms of Service
              </Link>
            </li>
            <li>
              <Link
                to="/legal/privacy"
                className="text-primary hover:underline font-medium"
              >
                Privacy Policy
              </Link>
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">GDPR & Data Rights</h2>
          <p className="text-muted-foreground text-sm">
            Under the General Data Protection Regulation (GDPR), you have the right to access,
            rectify, or delete your personal data. You may also request a copy of your data or
            object to its processing.
          </p>
          {session?.user ? (
            <div className="pt-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="gap-2">
                    <Trash2 className="h-4 w-4" />
                    Delete my account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                      <ShieldAlert className="h-5 w-5" />
                      Delete account permanently
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                      <p className="font-medium text-foreground">
                        This action cannot be undone.
                      </p>
                      <p>
                        All your data—including your account, preferences, and any stored
                        content—will be permanently deleted. You will be signed out immediately.
                      </p>
                      <p>
                        If you have an active subscription or credits, those will be forfeited.
                      </p>
                      <p className="pt-2">
                        Are you absolutely sure you want to delete your account?
                      </p>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAccount}
                      disabled={deleting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleting ? "Deleting…" : "Yes, delete my account"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sign in to manage or delete your account.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
