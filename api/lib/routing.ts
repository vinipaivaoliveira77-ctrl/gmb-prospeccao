import { Lead, Score } from './types';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
const SCORE_CUTOFF = 50;

export async function routeLeads(leads: Lead[], scores: Score[]): Promise<void> {
  for (const score of scores) {
    const lead = leads.find(l => l.id === score.lead_id);
    if (!lead) continue;

    let status = 'reserva';

    // Check opt-out
    const { data: optOut } = await supabase
      .from('opt_outs')
      .select('id')
      .or(`telefone.eq.${lead.telefone},instagram.eq.${lead.instagram}`)
      .maybeSingle();

    if (optOut) {
      status = 'opted_out';
    } else if (score.score_final >= SCORE_CUTOFF) {
      status = 'pronto_para_exportar';
    }

    await supabase.from('pipeline_status').insert({
      id: crypto.randomUUID(),
      lead_id: lead.id,
      status,
      kommo_lead_id: null,
      pushed_at: new Date().toISOString(),
    });
  }
}
