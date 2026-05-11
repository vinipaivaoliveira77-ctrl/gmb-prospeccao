import React from 'react';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function IndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.push('/jobs/novo');
  }, [router]);

  return <p>Redirecionando...</p>;
}
