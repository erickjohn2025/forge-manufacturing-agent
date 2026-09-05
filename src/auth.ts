import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import argon2 from "argon2";
import { z } from "zod";

import { db as prisma } from "@/lib/db";

const credentialsSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const db = prisma as unknown as {
          user: {
            findUnique(args: unknown): Promise<{
              id: string;
              email: string;
              name: string | null;
              passwordHash: string;
              memberships?: Array<{
                businessId: string;
                role: "ADMIN" | "OPERATOR" | "APPROVER";
                business?: { name: string };
              }>;
            } | null>;
          };
        };
        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
          include: { memberships: { include: { business: true }, take: 1 } },
        });
        if (!user || !(await argon2.verify(user.passwordHash, parsed.data.password))) return null;

        const membership = user.memberships?.[0];
        if (!membership) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          businessId: membership.businessId,
          businessName: membership.business?.name,
          role: membership.role,
        };
      },
    }),
  ],
  callbacks: {
    authorized({ auth: session, request }) {
      const isLogin = request.nextUrl.pathname === "/login";
      const isProtected = ["/objectives", "/configuration"].some((path) =>
        request.nextUrl.pathname.startsWith(path),
      );
      if (isLogin && session) return Response.redirect(new URL("/objectives", request.nextUrl));
      return isProtected ? Boolean(session) : true;
    },
    jwt({ token, user }) {
      if (user) {
        token.businessId = user.businessId;
        token.businessName = user.businessName;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.businessId = token.businessId as string;
        session.user.businessName = token.businessName as string | undefined;
        session.user.role = token.role as "ADMIN" | "OPERATOR" | "APPROVER";
      }
      return session;
    },
  },
});
