import React, { useEffect, useState } from 'react';
import { listJobs } from '../lib/api-client';

export const JobList: React.FC = () => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const data = await listJobs();
        setJobs(data);
      } catch (error) {
        console.error('Failed to fetch jobs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();

    // Poll every 5s
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <p>Carregando...</p>;

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Data</th>
          <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Segmento</th>
          <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Cidade</th>
          <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Status</th>
          <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Encontrados</th>
          <th style={{ border: '1px solid #ccc', padding: '0.5rem' }}>Empurrados</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map(job => (
          <tr key={job.id}>
            <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>
              {new Date(job.created_at).toLocaleString()}
            </td>
            <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{job.segmento}</td>
            <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{job.cidade}</td>
            <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}><strong>{job.status}</strong></td>
            <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{job.total_found}</td>
            <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{job.total_pushed}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
