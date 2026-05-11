export async function createJob(segmento: string, cidade: string, estado: string) {
  const response = await fetch('/api/jobs-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ segmento, cidade, estado }),
  });
  if (!response.ok) throw new Error(`API error: ${response.statusText}`);
  return response.json();
}

export async function listJobs() {
  const response = await fetch('/api/jobs-list', { method: 'GET' });
  if (!response.ok) throw new Error(`API error: ${response.statusText}`);
  return response.json();
}
