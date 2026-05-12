import React from 'react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div>
      <header style={{ padding: '1rem', borderBottom: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Prospecção GMB</h1>
        <nav>
          <a href="/jobs/novo" style={{ marginRight: '1rem' }}>Novo Job</a>
          <a href="/jobs" style={{ marginRight: '1rem' }}>Histórico</a>
        </nav>
      </header>
      <main style={{ padding: '2rem' }}>{children}</main>
    </div>
  );
};
