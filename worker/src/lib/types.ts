/**
 * Shared Types and Constants
 *
 * Tipos compartilhados entre API e Worker para o Sistema de Prospecção Ativa GMB.
 * Inclui enums, interfaces para banco de dados, e constantes de scoring e busca.
 */

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Segmento de negócio prospectado
 * Define as categorias de profissionais de saúde/estética que serão buscados
 */
export enum Segmento {
  ODONTO = 'odonto',
  MEDICO = 'medico',
  ESTETICA = 'estetica',
}

/**
 * Estados brasileiros suportados
 * Fase 1 cobre os 6 principais estados do Brasil
 */
export enum Estado {
  SP = 'SP',
  MG = 'MG',
  RJ = 'RJ',
  PR = 'PR',
  SC = 'SC',
  RS = 'RS',
}

/**
 * Status de um job de descoberta/prospecção
 * Rastreia o progresso de um job desde criação até conclusão
 */
export enum JobStatus {
  CREATED = 'created',
  DISCOVERING = 'discovering',
  DISCOVERED = 'discovered',
  EVALUATING = 'evaluating',
  EVALUATED = 'evaluated',
  PUSHING = 'pushing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Status de um lead no pipeline de Kommo
 * Rastreia a integração com CRM após scoring
 */
export enum PipelineStatusType {
  PENDING = 'pending',
  PUSHED = 'pushed',
  CONTACT_CREATED = 'contact_created',
  FAILED = 'failed',
}

/**
 * Motivo de opt-out (exclusão de um lead de prospecção)
 * Permite filtrar leads que já foram contatados ou estão indisponíveis
 */
export enum OptOutReason {
  ALREADY_CLIENT = 'already_client',
  NO_INTEREST = 'no_interest',
  INVALID_DATA = 'invalid_data',
  BUSINESS_CLOSED = 'business_closed',
  MANUAL = 'manual',
}

// ============================================================================
// INTERFACES — DATABASE MODELS
// ============================================================================

/**
 * Job
 *
 * Representa uma tarefa de descoberta de leads em um segmento/cidade específica.
 * Um job disparado pode gerar centenas de leads via Google Places.
 */
export interface Job {
  id: string;
  segmento: Segmento;
  estado: Estado;
  cidade: string;
  status: JobStatus;
  leads_count: number;
  leads_discovered: number;
  leads_scored: number;
  leads_passed_filter: number;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Lead
 *
 * Representa um negócio prospectado extraído via Google Places.
 * Contém dados básicos do negócio (nome, localização, contato) e metadados de descoberta.
 */
export interface Lead {
  id: string;
  job_id: string;
  google_place_id: string;
  nome: string;
  endereco: string;
  telefone?: string | null;
  website?: string | null;
  latitude: number;
  longitude: number;
  tipos_google: string[]; // ex: ["dentist", "health"]
  rating?: number | null;
  review_count?: number | null;
  discovered_at: string;
  updated_at: string;
}

/**
 * Score
 *
 * Armazena o resultado da avaliação de um lead segundo critérios de "dor".
 * Score = pontuação numérica que indica qualidade/potencial do lead.
 * Fase 1 utiliza apenas score_dor (sem enriquecimento).
 */
export interface Score {
  id: string;
  lead_id: string;
  job_id: string;
  score_dor: number; // 0-100: intensidade da dor/necessidade identificada
  passou_filtro: boolean; // true se score_dor >= SCORE_CUTOFF
  motivo_recusa?: string | null; // se não passou, por que?
  scored_at: string;
  updated_at: string;
}

/**
 * PipelineStatus
 *
 * Rastreia o status de um lead no pipeline de integração com Kommo (CRM).
 * Criado quando score >= cutoff; atualizado conforme lead avança no pipeline.
 */
export interface PipelineStatus {
  id: string;
  lead_id: string;
  job_id: string;
  status: PipelineStatusType;
  kommo_contact_id?: string | null; // ID do contato criado em Kommo
  error_message?: string | null;
  pushed_at?: string | null;
  updated_at: string;
}

/**
 * OptOut
 *
 * Registro de exclusão de um lead da prospecção automática.
 * Usado para evitar contato repetido ou respeitar preferências.
 */
export interface OptOut {
  id: string;
  lead_id: string;
  job_id?: string | null;
  motivo: OptOutReason;
  descricao?: string | null;
  created_at: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Termos de busca por segmento
 *
 * Mapa de segmento para lista de termos usados na Google Places API.
 * Busca por múltiplos termos para maximizar descoberta em cada segmento.
 */
export const SEARCH_TERMS: Record<Segmento, string[]> = {
  [Segmento.ODONTO]: [
    'dentista',
    'ortodontista',
    'implantodontista',
    'clínica odontológica',
    'odontologia',
  ],
  [Segmento.MEDICO]: [
    'clínica médica',
    'consultório médico',
    'clínica geral',
    'medicina',
  ],
  [Segmento.ESTETICA]: [
    'clínica estética',
    'estética',
    'harmonização facial',
    'dermatologia',
  ],
};

/**
 * Cutoff de score para aprovação na Fase 1
 *
 * Leads com score_dor >= SCORE_CUTOFF serão incluídos no pipeline de Kommo.
 * Fase 1 usa apenas score_dor (sem enriquecimento); pode evoluir em fases posteriores.
 */
export const SCORE_CUTOFF = 60;

/**
 * Paginação padrão para Google Places
 *
 * Número máximo de resultados por página na busca de Places.
 * Ajustável conforme necessidade de descoberta.
 */
export const PLACES_PAGE_SIZE = 20;

/**
 * Timeout para requisições à Google Places API (em ms)
 */
export const PLACES_API_TIMEOUT_MS = 30000;

/**
 * Timeout para requisições à Kommo API (em ms)
 */
export const KOMMO_API_TIMEOUT_MS = 10000;

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Verifica se um valor é um Segmento válido
 */
export function isSegmento(value: unknown): value is Segmento {
  return Object.values(Segmento).includes(value as Segmento);
}

/**
 * Verifica se um valor é um Estado válido
 */
export function isEstado(value: unknown): value is Estado {
  return Object.values(Estado).includes(value as Estado);
}

/**
 * Verifica se um valor é um JobStatus válido
 */
export function isJobStatus(value: unknown): value is JobStatus {
  return Object.values(JobStatus).includes(value as JobStatus);
}

/**
 * Verifica se um valor é um PipelineStatusType válido
 */
export function isPipelineStatusType(value: unknown): value is PipelineStatusType {
  return Object.values(PipelineStatusType).includes(value as PipelineStatusType);
}

/**
 * Verifica se um valor é um OptOutReason válido
 */
export function isOptOutReason(value: unknown): value is OptOutReason {
  return Object.values(OptOutReason).includes(value as OptOutReason);
}
