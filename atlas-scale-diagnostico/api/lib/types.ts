/**
 * Sistema de Prospecção Ativa GMB — Tipos Compartilhados
 * Usados por: google-places.ts, scoring.ts, discovery.ts, evaluation.ts, routing.ts
 */

/**
 * Segmentos de busca
 */
export type Segment = 'odonto' | 'medico' | 'estetica';

/**
 * Estados brasileiros cobertos
 */
export type State = 'SP' | 'MG' | 'RJ' | 'PR' | 'SC' | 'RS';

/**
 * Status de um job
 */
export type JobStatus = 'pending' | 'discovering' | 'scoring' | 'enriching' | 'completed' | 'failed';

/**
 * Status do lead no pipeline
 */
export type PipelineStatus = 'reserva' | 'pushed_to_kommo' | 'already_in_kommo' | 'opted_out' | 'manual_discard';

/**
 * Job — cada execução de varredura
 */
export interface Job {
  id: string; // UUID
  segmento: Segment;
  cidade: string;
  estado: State;
  status: JobStatus;
  created_at: string; // ISO 8601
  completed_at: string | null;
  total_found: number;
  total_pushed: number;
  error_message: string | null;
}

/**
 * Lead — uma ficha GMB encontrada
 */
export interface Lead {
  id: string; // UUID
  job_id: string; // UUID FK → jobs
  place_id: string; // ID único do Google Places
  nome: string;
  segmento: Segment;
  cidade: string;
  estado: State;
  telefone: string | null;
  instagram: string | null; // @handle sem URL
  site: string | null;
  link_gmb: string; // URL da ficha no Google Maps
  endereco: string;
  lat: number;
  lng: number;
  raw_data: Record<string, unknown>; // JSONB resposta bruta da Places API
  created_at: string; // ISO 8601
}

/**
 * Score — resultado de cálculos de dor e maturidade
 */
export interface Score {
  id: string; // UUID
  lead_id: string; // UUID FK → leads (UNIQUE)
  score_dor: number; // 0-100
  score_maturidade: number; // 0-100 (Fase 2+)
  score_final: number; // 0-100
  sinais_dor: Record<string, unknown>; // JSONB ex: {"poucas_fotos": true, "sem_telefone": false}
  sinais_mat: Record<string, unknown>; // JSONB (Fase 2+)
  top_3_problemas: string[]; // ex: ["Sem fotos", "Descrição vazia", "Não responde reviews"]
  calculated_at: string; // ISO 8601
}

/**
 * PipelineStatus — onde o lead está no fluxo pós-score
 */
export interface PipelineStatusRecord {
  id: string; // UUID
  lead_id: string; // UUID FK → leads (UNIQUE)
  status: PipelineStatus;
  kommo_lead_id: string | null;
  pushed_at: string | null; // ISO 8601
  notes: string | null;
}

/**
 * OptOut — dados de LGPD
 */
export interface OptOut {
  id: string; // UUID
  telefone: string | null;
  instagram: string | null;
  email: string | null;
  reason: string;
  created_at: string; // ISO 8601
}

/**
 * Google Places API response types (partial)
 */
export interface GooglePlace {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  formatted_phone_number?: string;
  website?: string;
  url?: string;
  opening_hours?: {
    open_now?: boolean;
    periods?: Array<{
      open: { day: number; time: string };
      close?: { day: number; time: string };
    }>;
    weekday_text?: string[];
  };
  photos?: Array<{
    height: number;
    width: number;
    photo_reference: string;
  }>;
  reviews?: Array<{
    author_name: string;
    author_response?: {
      text: string;
      time: number;
    };
    time: number;
    rating: number;
    text: string;
  }>;
  editorial_summary?: {
    overview?: string;
  };
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
  [key: string]: unknown; // Para acomodar campos adicionais da API
}

/**
 * Termos de busca por segmento (configuráveis via dashboard em Fase 3)
 */
export const SEARCH_TERMS: Record<Segment, string[]> = {
  odonto: [
    'dentista',
    'ortodontista',
    'implantodontista',
    'clínica odontológica',
    'clínica dentária',
    'periodontista',
  ],
  medico: [
    'clínica médica',
    'consultório médico',
    'médico clínico geral',
    'clínica de saúde',
    'centro médico',
  ],
  estetica: [
    'clínica de estética',
    'estética',
    'dermatologia',
    'clínica de beleza',
    'consultório de estética',
  ],
};

/**
 * Configuração padrão de scoring (Fase 1)
 */
export const SCORE_CONFIG = {
  DOR_SINAL_POINTS: 20, // Cada um dos 5 sinais = 20 pontos
  DEFAULT_CUTOFF_PHASE_1: 60, // Corte em Fase 1 (só score_dor)
  DEFAULT_CUTOFF_PHASE_2: 50, // Corte em Fase 2 (com maturidade)
} as const;

/**
 * Rate limiting para Google Places API
 */
export const RATE_LIMIT_CONFIG = {
  DELAY_MS: 200, // 200ms entre Text Search queries
  PAGINATION_DELAY_MS: 2000, // 2s entre page tokens
} as const;
