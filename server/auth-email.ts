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
  const actionHtml = actionLabel && actionUrl
    ? `<p><a href="${actionUrl}" style="display:inline-block;padding:10px 16px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;">${actionLabel}</a></p><p style="word-break:break-all;color:#6b7280;font-size:12px;">${actionUrl}</p>`
    : "";

  const actionText = actionLabel && actionUrl
    ? `${actionLabel}: ${actionUrl}`
    : "";

  const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;line-height:1.5;color:#111827;">
  <h1 style="font-size:22px;margin:0 0 12px;">${heading}</h1>
  <p style="margin:0 0 16px;">${intro}</p>
  ${actionHtml}
  ${outro ? `<p style="margin-top:16px;color:#374151;">${outro}</p>` : ""}
  <p style="margin-top:24px;color:#6b7280;font-size:12px;">OctaCard</p>
</div>`;

  const textParts = [heading, intro, actionText, outro, "OctaCard"].filter(Boolean);
  const textOutput = textParts.join("\n\n");

  return { html, text: textOutput };
}
