import { createAuthClient } from "better-auth/react";

const appVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.0";

export const authClient = createAuthClient({
  // baseURL omitted - same origin; /api/auth proxied by Vite in dev
  fetchOptions: {
    credentials: "include",
    headers: {
      "X-Client-Version": appVersion,
    },
  },
});

export const { signIn, signUp, signOut, useSession, deleteUser } = authClient;
