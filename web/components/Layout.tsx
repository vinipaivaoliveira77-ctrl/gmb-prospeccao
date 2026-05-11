import React from 'react';
import { useAuth } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/router';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const router = useRouter();

  if (!user) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>Prospecção GMB</h1>
        <p>Faça login para continuar</p>
        <button onClick={() => router.push('/auth')}>Login</button>
      </div>
    );
  }

  return (
    <div>
      <header style={{ padding: '1rem', borderBottom: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Prospecção GMB</h1>
        <nav>
          <a href="/jobs/novo" style={{ marginRight: '1rem' }}>Novo Job</a>
          <a href="/jobs" style={{ marginRight: '1rem' }}>Histórico</a>
          <button onClick={() => router.push('/auth')}>Logout</button>
        </nav>
      </header>
      <main style={{ padding: '2rem' }}>{children}</main>
    </div>
  );
};
