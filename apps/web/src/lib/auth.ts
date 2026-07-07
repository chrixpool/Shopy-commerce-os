import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import type { DefaultSession } from 'next-auth';
import { SignInSchema } from '@shopy/shared';

// Augment next-auth types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      organizationId: string;
      organizationName: string;
      organizationSlug: string;
    } & DefaultSession['user'];
  }
  interface User {
    role: string;
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
  }
}

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const AUTH_SECRET = process.env.AUTH_SECRET || 'shopy-dev-secret-change-in-production-32chars';

function apiUrl(path: string) {
  const base = API_URL.replace(/\/$/, '');
  if (base.endsWith('/api/v1') && path.startsWith('/api/v1')) {
    return `${base}${path.slice('/api/v1'.length)}`;
  }
  return `${base}${path}`;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (credentials) => {
        const parsed = SignInSchema.safeParse(credentials);
        if (!parsed.success) return null;

        try {
          const res = await fetch(apiUrl('/api/v1/auth/validate'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsed.data),
          });

          if (!res.ok) return null;

          const user = (await res.json()) as {
            id: string;
            name: string;
            email: string;
            role: string;
            organizationId: string;
            organization: { id: string; name: string; slug: string };
          };

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            organizationId: user.organizationId,
            organizationName: user.organization.name,
            organizationSlug: user.organization.slug,
          };
        } catch {
          return null;
        }
      },
    }),
  ],

  pages: {
    signIn: '/sign-in',
    error: '/sign-in',
  },

  session: { strategy: 'jwt' },

  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.organizationId = user.organizationId;
        token.organizationName = user.organizationName;
        token.organizationSlug = user.organizationSlug;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.role = token.role as string;
      session.user.organizationId = token.organizationId as string;
      session.user.organizationName = token.organizationName as string;
      session.user.organizationSlug = token.organizationSlug as string;
      return session;
    },
  },

  secret: AUTH_SECRET,
});
