import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { customSession, emailOTP, magicLink } from "better-auth/plugins";
import { RoleName } from "../generated/prisma/client.js";
import { createPostgresStorage } from "./storage/postgres-cache.js";
import { renderAuthEmailTemplate, sendAuthEmail } from "./auth-email.js";
import { prisma } from "./db.js";

const SUPERADMIN_EMAILS = new Set(
  (process.env.AUTH_SUPERADMIN_EMAILS ?? "cremoni@gmail.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

// When SES is not configured (local dev), skip email verification so registration works
const sesConfigured = Boolean(process.env.SES_FROM_EMAIL);
const googleClientId = process.env.BETTER_AUTH_GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.BETTER_AUTH_GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;

async function applyUserRolesOnCreate(userId: string, email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const roles: RoleName[] = SUPERADMIN_EMAILS.has(normalizedEmail) ? [RoleName.ADMIN, RoleName.SUPERADMIN] : [];
  if (roles.length === 0) return;

  await prisma.userRole.createMany({
    data: roles.map((role) => ({ userId, role })),
    skipDuplicates: true,
  });
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  basePath: "/api/auth",
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: sesConfigured,
    sendResetPassword: async ({ user, url }) => {
      const { html, text } = renderAuthEmailTemplate({
        heading: "Reset your password",
        intro: "We received a request to reset your OctaCard password.",
        actionLabel: "Reset password",
        actionUrl: url,
        outro: "If you did not request this, you can ignore this email.",
      });
      await sendAuthEmail({
        to: user.email,
        subject: "OctaCard password reset",
        html,
        text,
      });
    },
  },
  socialProviders:
    googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : (() => {
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              "[auth] Google sign-in disabled: set BETTER_AUTH_GOOGLE_CLIENT_ID and BETTER_AUTH_GOOGLE_CLIENT_SECRET"
            );
          }
          return undefined;
        })(),
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    sendVerificationEmail: async ({ user, url }) => {
      const { html, text } = renderAuthEmailTemplate({
        heading: "Verify your email",
        intro: "Click the button below to verify your email and activate your OctaCard account. No password needed.",
        actionLabel: "Verify & activate account",
        actionUrl: url,
      });
      await sendAuthEmail({
        to: user.email,
        subject: "Verify your OctaCard email",
        html,
        text,
      });
    },
  },
  secondaryStorage: createPostgresStorage(),
  user: {
    deleteUser: {
      enabled: true,
      // sendDeleteAccountVerification: configure via SES when ready
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await applyUserRolesOnCreate(user.id, user.email);
        },
      },
    },
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        const { html, text } = renderAuthEmailTemplate({
          heading: "Sign in to OctaCard",
          intro: "Use this secure magic link to sign in.",
          actionLabel: "Sign in",
          actionUrl: url,
          outro: "This link expires soon and can only be used once.",
        });
        await sendAuthEmail({
          to: email,
          subject: "Your OctaCard magic link",
          html,
          text,
        });
      },
    }),
    emailOTP({
      sendVerificationOTP: async ({ email, otp, type }) => {
        const subjectMap: Record<string, string> = {
          "sign-in": "Your OctaCard sign-in code",
          "email-verification": "Your OctaCard email verification code",
          "forget-password": "Your OctaCard password reset code",
          "change-email": "Your OctaCard email change code",
        };
        const { html, text } = renderAuthEmailTemplate({
          heading: "Your one-time code",
          intro: `Your code is ${otp}. This code is for ${type.replace("-", " ")}.`,
          outro: "If you did not request this code, you can ignore this email.",
        });
        await sendAuthEmail({
          to: email,
          subject: subjectMap[type] ?? "Your OctaCard verification code",
          html,
          text,
        });
      },
      sendVerificationOnSignUp: true,
    }),
    customSession(async ({ user, session }) => {
      const roles = await prisma.userRole.findMany({
        where: { userId: session.userId },
        select: { role: true },
      });
      return {
        user,
        session,
        roles: roles.map((r) => r.role),
      };
    }),
  ],
  trustedOrigins: (() => {
    const base = ["http://localhost:3000", "http://127.0.0.1:3000"];
    const baseUrl = process.env.BETTER_AUTH_URL;
    if (baseUrl && !baseUrl.includes("localhost") && !baseUrl.includes("127.0.0.1")) {
      base.push(baseUrl.replace(/\/$/, "")); // trim trailing slash
    }
    const extra = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    return [...base, ...(extra ?? [])];
  })(),
});

export type Auth = typeof auth;
