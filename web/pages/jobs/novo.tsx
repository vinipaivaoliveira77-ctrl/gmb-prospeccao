import React from 'react';
import { useRouter } from 'next/router';
import { JobForm } from '../../components/JobForm';

export default function NovoJobPage() {
  const router = useRouter();

  return (
    <div>
      <h2>Disparar Nova Varredura</h2>
      <JobForm onSuccess={() => { router.push('/jobs'); }} />
    </div>
  );
}
