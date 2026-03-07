import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export default function TermsOfService() {
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
        <h1>Terms of Service</h1>
        <p className="text-muted-foreground">Last updated: March 2025</p>

        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using OctaCard (&quot;the Service&quot;), you agree to be bound by these
          Terms of Service. If you do not agree to these terms, please do not use the Service.
        </p>

        <h2>2. Description of Service</h2>
        <p>
          OctaCard is an audio file management and conversion tool. It allows you to browse, edit,
          convert, and organize audio files. The Service may be offered as a web application or
          other software.
        </p>

        <h2>3. Account Registration</h2>
        <p>
          You may need to create an account to access certain features. You are responsible for
          maintaining the confidentiality of your account credentials and for all activities that
          occur under your account. You must provide accurate and complete information when
          registering.
        </p>

        <h2>4. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for any illegal purpose or in violation of any laws</li>
          <li>Upload, transmit, or distribute content that infringes intellectual property rights</li>
          <li>Attempt to gain unauthorized access to the Service or other users&apos; accounts</li>
          <li>Interfere with or disrupt the Service or servers</li>
          <li>Use the Service to distribute malware or harmful code</li>
        </ul>

        <h2>5. Intellectual Property</h2>
        <p>
          The Service and its original content, features, and functionality are owned by OctaCard
          and are protected by copyright, trademark, and other intellectual property laws. You may
          not copy, modify, or create derivative works without our prior written consent.
        </p>

        <h2>6. Privacy</h2>
        <p>
          Your use of the Service is also governed by our{" "}
          <Link to="/legal/privacy" className="text-primary underline">
            Privacy Policy
          </Link>
          , which describes how we collect, use, and protect your information.
        </p>

        <h2>7. Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND,
          EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE,
          OR SECURE.
        </p>

        <h2>8. Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, OCTACARD SHALL NOT BE LIABLE FOR ANY INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR DATA,
          ARISING FROM YOUR USE OF THE SERVICE.
        </p>

        <h2>9. Termination</h2>
        <p>
          We may suspend or terminate your access to the Service at any time, with or without
          cause. You may also delete your account at any time through the Legal & Privacy page.
        </p>

        <h2>10. Changes</h2>
        <p>
          We may update these Terms from time to time. We will notify you of material changes by
          posting the updated Terms on the Service. Your continued use of the Service after such
          changes constitutes acceptance of the new Terms.
        </p>

        <h2>11. Contact</h2>
        <p>
          For questions about these Terms, please contact us at the address or email provided in
          our Privacy Policy.
        </p>
      </main>
    </div>
  );
}
