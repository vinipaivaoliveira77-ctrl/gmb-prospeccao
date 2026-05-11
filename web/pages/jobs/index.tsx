import React from 'react';
import Link from 'next/link';
import { JobList } from '../../components/JobList';

export default function JobsPage() {
  return (
    <div>
      <h2>Histórico de Jobs</h2>
      <Link href="/jobs/novo"><a>← Voltar para novo job</a></Link>
      <hr />
      <JobList />
    </div>
  );
}
