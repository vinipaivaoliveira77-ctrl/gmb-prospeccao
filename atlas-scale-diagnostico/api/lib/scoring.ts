/**
 * Scoring - Deteccao de sinais de dor e calculo de score
 */

import { Lead, SCORE_CONFIG } from './types';

export interface SinaisDor {
  poucas_fotos: boolean;
  sem_descricao: boolean;
  sem_telefone: boolean;
  sem_horario: boolean;
  sem_resposta_reviews: boolean;
}

export function detectSinaisDor(lead: Lead): SinaisDor {
  const raw = lead.raw_data;

  const photos = (raw.photos as any[]) || [];
  const poucas_fotos = photos.length < 10;

  const overview = ((raw.editorial_summary as any)?.overview as string) || '';
  const sem_descricao = overview.length < 200;

  const sem_telefone = !lead.telefone && !(raw.formatted_phone_number as string);

  const sem_horario = !(raw.opening_hours as any);

  const sixMonthsAgoUnix = Math.floor(Date.now() / 1000) - 180 * 24 * 60 * 60;
  const reviews = ((raw.reviews as any[]) || []);
  const recentReviewsWithoutResponse = reviews.some(review => {
    const reviewTime = review.time as number;
    const isRecent = reviewTime > sixMonthsAgoUnix;
    const hasResponse = !!review.author_response;
    return isRecent && !hasResponse;
  });
  const sem_resposta_reviews = recentReviewsWithoutResponse;

  return {
    poucas_fotos,
    sem_descricao,
    sem_telefone,
    sem_horario,
    sem_resposta_reviews,
  };
}

export function calculateScoreDor(lead: Lead): number {
  const sinais = detectSinaisDor(lead);
  const count = Object.values(sinais).filter(Boolean).length;
  return count * SCORE_CONFIG.DOR_SINAL_POINTS;
}

export function calculateTop3Problems(sinais: SinaisDor): string[] {
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
