import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP, magicLink } from "better-auth/plugins";
import { PrismaClient, RoleName } from "@prisma/client";
import { createRedisStorage } from "./redis.js";
import { renderAuthEmailTemplate, sendAuthEmail } from "./auth-email.js";

const prisma = new PrismaClient();
const SUPERADMIN_EMAILS = new Set(
  (process.env.AUTH_SUPERADMIN_EMAILS ?? "cremoni@gmail.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

async function applyUserRolesOnCreate(userId: string, email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const roles: RoleName[] = SUPERADMIN_EMAILS.has(normalizedEmail)
    ? [RoleName.ADMIN, RoleName.SUPERADMIN]
    : [];
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
    requireEmailVerification: true,
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
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    sendVerificationEmail: async ({ user, url }) => {
      const { html, text } = renderAuthEmailTemplate({
        heading: "Verify your email",
        intro: "Please verify your email address to finish setting up your OctaCard account.",
        actionLabel: "Verify email",
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
  secondaryStorage: createRedisStorage(),
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
  ],
  trustedOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://*.vercel.app",
  ],
});

export type Auth = typeof auth;
