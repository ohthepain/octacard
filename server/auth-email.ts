import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const region = process.env.AWS_REGION ?? "eu-central-1";
const fromEmail = process.env.SES_FROM_EMAIL;
const configurationSetName = process.env.SES_CONFIGURATION_SET;

const ses = new SESv2Client({ region });

type SendAuthEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendAuthEmail({ to, subject, html, text }: SendAuthEmailInput): Promise<void> {
  if (!fromEmail) {
    console.warn("[auth-email] SES_FROM_EMAIL is not configured; email not sent");
    console.info(`[auth-email] To: ${to} | Subject: ${subject}`);
    console.info(`[auth-email] Body: ${text}`);
    return;
  }

  const command = new SendEmailCommand({
    FromEmailAddress: fromEmail,
    Destination: {
      ToAddresses: [to],
    },
    Content: {
      Simple: {
        Subject: {
          Data: subject,
          Charset: "UTF-8",
        },
        Body: {
          Text: {
            Data: text,
            Charset: "UTF-8",
          },
          Html: {
            Data: html,
            Charset: "UTF-8",
          },
        },
      },
    },
    ...(configurationSetName ? { ConfigurationSetName: configurationSetName } : {}),
  });

  await ses.send(command);
}

export function renderAuthEmailTemplate({
  heading,
  intro,
  actionLabel,
  actionUrl,
  outro,
}: {
  heading: string;
  intro: string;
  actionLabel?: string;
  actionUrl?: string;
  outro?: string;
}): { html: string; text: string } {
  // Table-based button for Gmail/Outlook compatibility; one click verifies and signs in
  const actionHtml =
    actionLabel && actionUrl
      ? `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="border-radius:8px;background:#111827;">
        <a href="${actionUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#ffffff !important;text-decoration:none;border-radius:8px;">${actionLabel}</a>
      </td>
    </tr>
  </table>
  <p style="margin:0;color:#6b7280;font-size:12px;">Or copy this link: <a href="${actionUrl}" style="color:#6b7280;word-break:break-all;">${actionUrl}</a></p>`
      : "";

  const actionText = actionLabel && actionUrl ? `${actionLabel}: ${actionUrl}` : "";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <p style="margin:0 0 8px;font-size:14px;color:#6b7280;font-weight:500;">OctaCard</p>
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#111827;">${heading}</h1>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#374151;">${intro}</p>
    ${actionHtml}
    ${outro ? `<p style="margin-top:24px;font-size:14px;line-height:1.6;color:#374151;">${outro}</p>` : ""}
    <p style="margin-top:32px;padding-top:24px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">OctaCard – Audio sample management</p>
  </div>
</body>
</html>`;

  const textParts = [heading, intro, actionText, outro, "OctaCard"].filter(Boolean);
  const textOutput = textParts.join("\n\n");

  return { html, text: textOutput };
}
