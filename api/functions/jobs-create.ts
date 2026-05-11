import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

export default async function handler(req: Request) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { segmento, cidade, estado } = await req.json();

  // Validate
  if (!['odonto', 'medico', 'estetica'].includes(segmento)) {
    return new Response('Invalid segmento', { status: 400 });
  }
  if (!['SP', 'MG', 'RJ', 'PR', 'SC', 'RS'].includes(estado)) {
    return new Response('Invalid estado', { status: 400 });
  }
  if (!cidade || typeof cidade !== 'string') {
    return new Response('Invalid cidade', { status: 400 });
  }

  try {
    const { data, error } = await supabase.from('jobs').insert([
      { segmento, cidade, estado, status: 'pending' }
    ]).select().single();

    if (error) return new Response(`Failed: ${error.message}`, { status: 500 });

    return new Response(JSON.stringify(data), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(`Error: ${error}`, { status: 500 });
  }
}
