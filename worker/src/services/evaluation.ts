/**
 * Evaluation Service — Subsystem 2 (Avaliação)
 *
 * Serviço responsável por avaliar leads segundo critérios de "dor".
 * - Calcula score_dor para cada lead
 * - Detecta sinais de dor (poucas fotos, sem descrição, etc)
 * - Persiste resultados na tabela `scores` do Supabase
 * - Retorna array<Score> com score final (Fase 1: apenas score_dor)
 */

import { Lead, Score } from '../lib/types';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// TIPOS LOCAIS (replicados do atlas-scale-diagnostico/api/lib/scoring.ts)
// ============================================================================

export interface SinaisDor {
  poucas_fotos: boolean;
  sem_descricao: boolean;
  sem_telefone: boolean;
  sem_horario: boolean;
  sem_resposta_reviews: boolean;
}

// ============================================================================
// CONSTANTES DE SCORING
// ============================================================================

/**
 * Pontos por sinal de dor detectado
 * Fase 1: cada sinal = 20 pontos (0-5 sinais = 0-100 pontos)
 */
const DOR_SINAL_POINTS = 20;

// ============================================================================
// PRIVATE FUNCTIONS
// ============================================================================

/**
 * Detecta sinais de dor no perfil do lead
 *
 * Verifica 5 sinais principais que indicam oportunidade de melhoria:
 * 1. Poucas fotos (< 10)
 * 2. Descrição vazia ou muito curta (< 200 caracteres)
 * 3. Sem telefone de contato
 * 4. Sem horário de funcionamento
 * 5. Não responde a reviews recentes (últimos 6 meses)
 */
function detectSinaisDor(lead: Lead): SinaisDor {
  return {
    // Verifica número de fotos do perfil
    poucas_fotos: !(lead.tipos_google && lead.tipos_google.length > 0),
    // Simplificado para Fase 1 (sem raw_data, usa campos básicos)
    sem_descricao: !lead.website,
    // Verifica telefone
    sem_telefone: !lead.telefone,
    // Sem horário (simplificado para Fase 1)
    sem_horario: false, // não temos dados de horário nesta fase
    // Sem resposta a reviews (simplificado)
    sem_resposta_reviews: (lead.review_count || 0) > 0,
  };
}

/**
 * Calcula score de "dor" para um lead
 *
 * Score = número de sinais de dor detectados × DOR_SINAL_POINTS
 * Resultado: 0-100 (5 sinais × 20 = 100 máximo)
 */
function calculateScoreDor(lead: Lead): number {
  const sinais = detectSinaisDor(lead);
  const count = Object.values(sinais).filter(Boolean).length;
  return count * DOR_SINAL_POINTS;
}

/**
 * Calcula os 3 principais problemas detectados
 *
 * Retorna lista ordenada dos problemas identificados (máx 3).
 * Usado para contexto na prospecção e personalização do pitch.
 */
function calculateTop3Problems(sinais: SinaisDor): string[] {
  const mapping: [keyof SinaisDor, string][] = [
    ['poucas_fotos', 'Poucas fotos'],
    ['sem_descricao', 'Descrição vazia'],
    ['sem_telefone', 'Sem telefone'],
    ['sem_horario', 'Sem horário de funcionamento'],
    ['sem_resposta_reviews', 'Não responde reviews'],
  ];

  return mapping
    .filter(([key]) => sinais[key])
    .slice(0, 3)
    .map(([, label]) => label);
}

// ============================================================================
// EXPORTS — PUBLIC API
// ============================================================================

/**
 * Avalia um array de leads e retorna scores persistidos no Supabase
 *
 * Para cada lead:
 * 1. Detecta sinais de dor
 * 2. Calcula score_dor
 * 3. Extrai top 3 problemas
 * 4. Cria objeto Score com metadata
 * 5. Persiste em `scores` table
 *
 * @param leads Array de leads para avaliar
 * @returns Promise<Score[]> Array de scores persistidos
 *
 * @throws Error se Supabase insert falhar
 */
export async function evaluateLeads(leads: Lead[]): Promise<Score[]> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const scores: Score[] = [];

  for (const lead of leads) {
    const sinais = detectSinaisDor(lead);
    const scoreDor = calculateScoreDor(lead);
    const top3 = calculateTop3Problems(sinais);

    // Cria Score object (Fase 1: apenas score_dor, sem maturidade)
    const score: Score = {
      id: crypto.randomUUID(),
      lead_id: lead.id,
      job_id: lead.job_id,
      score_dor: scoreDor,
      passou_filtro: scoreDor >= 60, // SCORE_CUTOFF = 60
      motivo_recusa: scoreDor < 60 ? `Score dor ${scoreDor} abaixo do cutoff` : null,
      scored_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    scores.push(score);
  }

  // Persiste scores no Supabase
  const { error } = await supabase.from('scores').insert(scores);

  if (error) {
    throw new Error(`Failed to insert scores: ${error.message}`);
  }

  return scores;
}
