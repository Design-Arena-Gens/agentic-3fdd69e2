'use client';

import { SessionProvider } from 'next-auth/react';
import { createContext, useContext, type ReactNode } from 'react';
import type { Session } from 'next-auth';

type ProvidersProps = {
  children: ReactNode;
  session: Session | null;
  authConfigured: boolean;
};

const AuthConfigContext = createContext(false);

export function useAuthConfigured() {
  return useContext(AuthConfigContext);
}

export default function Providers({ children, session, authConfigured }: ProvidersProps) {
  return (
    <AuthConfigContext.Provider value={authConfigured}>
      <SessionProvider session={session}>{children}</SessionProvider>
    </AuthConfigContext.Provider>
  );
}
