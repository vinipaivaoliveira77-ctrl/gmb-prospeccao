/**
 * Discovery Service — Subsistema 1
 *
 * Responsável pela descoberta de leads via Google Places API.
 * - Busca fichas GMB por segmento/cidade/estado
 * - Salva leads em Supabase tabela `leads`
 * - Rastreia progresso com logs
 * - Retorna array de leads descobertos
 */

import { searchPlaces } from '../lib/google-places';
import { createClient } from '@supabase/supabase-js';
import { Lead, Segmento, Estado } from '../lib/types';

/**
 * Input para o subsistema de descoberta
 */
export interface DiscoveryInput {
  job_id: string;
  segmento: Segmento;
  cidade: string;
  estado: Estado;
}

/**
 * Inicializa cliente Supabase
 */
function initSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required');
  }

  return createClient(url, serviceKey);
}

/**
 * Descobre e salva leads no Supabase
 *
 * @param input Configuração de descoberta (job_id, segmento, cidade, estado)
 * @returns Array de leads descobertos
 */
export async function discoverClinics(input: DiscoveryInput): Promise<Lead[]> {
  console.log(`[Discovery] Iniciando: ${input.segmento} em ${input.cidade}, ${input.estado}`);
  console.log(`[Discovery] job_id: ${input.job_id}`);

  const supabase = initSupabaseClient();

  try {
    // Step 1: Busca leads via Google Places
    console.log(`[Discovery] Buscando leads via Google Places...`);
    const leadsFromPlaces = await searchPlaces(input.segmento, input.cidade, input.estado, input.job_id);
    console.log(`[Discovery] Encontrados ${leadsFromPlaces.length} leads`);

    if (leadsFromPlaces.length === 0) {
      console.log(`[Discovery] Nenhum lead encontrado. Finalizando.`);
      return [];
    }

    // Step 2: Insere leads no Supabase
    console.log(`[Discovery] Salvando ${leadsFromPlaces.length} leads em Supabase...`);
    const { data, error } = await supabase.from('leads').insert(leadsFromPlaces).select();

    if (error) {
      throw new Error(`Erro ao inserir leads em Supabase: ${error.message}`);
    }

    console.log(`[Discovery] ${data?.length || 0} leads salvos com sucesso`);

    // Step 3: Log de sucesso
    console.log(`[Discovery] Conclusão: ${leadsFromPlaces.length} leads descobertos e salvos`);
    console.log(`[Discovery] job_id: ${input.job_id}`);

    return leadsFromPlaces;
  } catch (error) {
    console.error(`[Discovery] Erro durante descoberta:`, error);
    throw error;
  }
}

/**
 * Função auxiliar: verifica se leads foram salvos com sucesso
 * Útil para debugging e monitoramento
 */
export async function getDiscoveredLeads(jobId: string): Promise<Lead[]> {
  const supabase = initSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('job_id', jobId);

    if (error) {
      throw new Error(`Erro ao buscar leads: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    console.error(`[Discovery] Erro ao recuperar leads do job ${jobId}:`, error);
    throw error;
  }
}
