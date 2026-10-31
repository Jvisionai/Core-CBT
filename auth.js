import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';

const hasGoogleOAuthConfig = Boolean(
  String(process.env.GOOGLE_CLIENT_ID || '').trim() &&
  String(process.env.GOOGLE_CLIENT_SECRET || '').trim()
);

const allProviders = [
  Credentials({
    id: 'admin-login',
    name: 'Admin Login',
    credentials: {
      username: { label: '아이디', type: 'text' },
      password: { label: '비밀번호', type: 'password' }
    },
    async authorize(credentials) {
      if (
        credentials?.username === 'admin' &&
        credentials?.password === process.env.ADMIN_PW
      ) {
        return { id: 'admin', name: '관리자', email: 'admin@example.com', role: 'admin' };
      }
      // 테스트 계정은 TEST_LOGIN_PW가 설정된 환경에서만 활성화
      const testLoginPw = String(process.env.TEST_LOGIN_PW || '');
      if (
        testLoginPw &&
        credentials?.username === 'testuser' &&
        credentials?.password === testLoginPw
      ) {
        return { id: 'testuser', name: '테스트유저', email: 'testuser@test.com', role: 'user' };
      }
      return null;
    },
  }),
];

if (hasGoogleOAuthConfig) {
  allProviders.push(Google({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  }));
}

const providers = allProviders;

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET || 'dev-fallback-secret',
  providers,
  session: {
    strategy: 'jwt',
    // 30 days
    maxAge: 30 * 24 * 60 * 60,
    // refresh JWT age every 24 hours when active
    updateAge: 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role || (user.id === 'admin' ? 'admin' : 'user');
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.role) {
        session.user.role = token.role;
      }
      return session;
    }
  },
});
