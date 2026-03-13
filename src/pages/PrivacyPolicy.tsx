import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <Link to="/" className="text-lg font-semibold">
            OctaCard
          </Link>
          <Link to="/legal">
            <Button variant="ghost" size="sm">
              Back to Legal
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 prose prose-neutral dark:prose-invert max-w-none">
        <h1>Privacy Policy</h1>
        <p className="text-muted-foreground">Last updated: March 2025</p>

        <h2>1. Introduction</h2>
        <p>
          OctaCard (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) respects your privacy. This Privacy Policy
          explains how we collect, use, disclose, and safeguard your information when you use our
          audio file management and conversion service.
        </p>

        <h2>2. Information We Collect</h2>
        <p>We may collect information that you provide directly to us:</p>
        <ul>
          <li>
            <strong>Account information:</strong> when you register, we collect your email address,
            name, and password (stored in hashed form).
          </li>
          <li>
            <strong>Usage data:</strong> we may collect information about how you use the Service,
            including features used and actions taken.
          </li>
          <li>
            <strong>Device information:</strong> we may collect information about your device,
            browser, and IP address for security and analytics purposes.
          </li>
        </ul>

        <h2>3. How We Use Your Information</h2>
        <p>We use the information we collect to:</p>
        <ul>
          <li>Provide, maintain, and improve the Service</li>
          <li>Authenticate your identity and manage your account</li>
          <li>Send you service-related communications</li>
          <li>Detect and prevent fraud or abuse</li>
          <li>Comply with legal obligations</li>
          <li>Analyze usage patterns to improve our product</li>
        </ul>

        <h2>4. Data Storage and Security</h2>
        <p>
          Your data is stored on secure servers. We use industry-standard security measures to
          protect your information. Passwords are hashed and never stored in plain text. Session
          data may be stored in PostgreSQL for performance.
        </p>

        <h2>5. Data Sharing</h2>
        <p>
          We do not sell your personal information. We may share your information with:
        </p>
        <ul>
          <li>
            <strong>Service providers:</strong> third parties that help us operate the Service
            (e.g., hosting, analytics, email delivery), subject to confidentiality agreements.
          </li>
          <li>
            <strong>Legal requirements:</strong> when required by law or to protect our rights.
          </li>
        </ul>

        <h2>6. Analytics</h2>
        <p>
          We may use analytics services (e.g., PostHog) to understand how users interact with the
          Service. These services may collect anonymized data. You can opt out of analytics where
          we provide that option.
        </p>

        <h2>7. Cookies and Similar Technologies</h2>
        <p>
          We use cookies and similar technologies for authentication, session management, and
          preferences. Essential cookies are required for the Service to function. You can control
          cookies through your browser settings.
        </p>

        <h2>8. Your Rights (GDPR)</h2>
        <p>If you are in the European Economic Area, you have the right to:</p>
        <ul>
          <li>Access your personal data</li>
          <li>Rectify inaccurate data</li>
          <li>Request deletion of your data</li>
          <li>Object to processing</li>
          <li>Data portability</li>
          <li>Withdraw consent</li>
          <li>Lodge a complaint with a supervisory authority</li>
        </ul>
        <p>
          You can delete your account and associated data at any time from the Legal & Privacy
          page.
        </p>

        <h2>9. Data Retention</h2>
        <p>
          We retain your data for as long as your account is active. When you delete your account,
          we delete your personal data within a reasonable period, except where we are required to
          retain it by law.
        </p>

        <h2>10. Children</h2>
        <p>
          The Service is not intended for users under 13. We do not knowingly collect information
          from children under 13. If you believe we have collected such information, please
          contact us.
        </p>

        <h2>11. International Transfers</h2>
        <p>
          Your data may be transferred to and processed in countries other than your own. We ensure
          appropriate safeguards are in place for such transfers.
        </p>

        <h2>12. Changes</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify you of material
          changes by posting the updated policy on the Service. Your continued use of the Service
          after such changes constitutes acceptance of the new policy.
        </p>

        <h2>13. Contact</h2>
        <p>
          For privacy-related questions or to exercise your rights, please contact us at{" "}
          <a href="mailto:cremoni@gmail.com" className="text-primary underline">
            cremoni@gmail.com
          </a>
          .
        </p>
      </main>
    </div>
  );
}
