import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Buscar leads prontos para exportar
  const { data: pipelines, error: pipelineError } = await supabase
    .from('pipeline_status')
    .select('lead_id')
    .eq('status', 'pronto_para_exportar');

  if (pipelineError) {
    return res.status(500).json({ error: pipelineError.message });
  }

  const leadIds = pipelines?.map(p => p.lead_id) || [];

  if (leadIds.length === 0) {
    return res.status(200).json({ leads: [], total: 0 });
  }

  // Buscar detalhes dos leads
  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('*')
    .in('id', leadIds);

  if (leadsError) {
    return res.status(500).json({ error: leadsError.message });
  }

  // Buscar scores dos leads
  const { data: scores, error: scoresError } = await supabase
    .from('scores')
    .select('*')
    .in('lead_id', leadIds);

  if (scoresError) {
    return res.status(500).json({ error: scoresError.message });
  }

  // Combinar leads com scores
  const leadsComScore = leads?.map(lead => {
    const score = scores?.find(s => s.lead_id === lead.id);
    return {
      id: lead.id,
      nome: lead.nome_negocio,
      telefone: lead.telefone || '',
      instagram: lead.instagram || '',
      site: lead.site || '',
      segmento: lead.segmento,
      cidade: lead.cidade,
      estado: lead.estado,
      score: score?.score_final || 0,
      problemas: score?.top_3_problemas || [],
      link_gmb: lead.lugar_id ? `https://maps.google.com/maps?cid=${lead.lugar_id}` : '',
      data_descoberta: lead.created_at,
    };
  }) || [];

  res.status(200).json({
    leads: leadsComScore,
    total: leadsComScore.length,
    timestamp: new Date().toISOString(),
  });
}
