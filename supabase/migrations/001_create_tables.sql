-- Sistema de Prospecção Ativa GMB
-- Migration 001: Create core tables
-- Date: 2026-05-11

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE segmento_enum AS ENUM ('odonto', 'medico', 'estetica');
CREATE TYPE job_status_enum AS ENUM ('pending', 'discovering', 'scoring', 'enriching', 'completed', 'failed');
CREATE TYPE pipeline_status_enum AS ENUM ('reserva', 'pushed_to_kommo', 'already_in_kommo', 'opted_out', 'manual_discard');

-- ============================================================================
-- TABLES
-- ============================================================================

-- Table: jobs
-- Purpose: Each execution of a prospecting job
-- One row per job = one segment + city combination
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segmento segmento_enum NOT NULL,
  cidade TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (length(estado) = 2), -- SP, MG, RJ, PR, SC, RS
  status job_status_enum NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  total_found INT NOT NULL DEFAULT 0,
  total_pushed INT NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX idx_jobs_segmento_cidade_estado ON jobs(segmento, cidade, estado);

-- Table: leads
-- Purpose: Each GMB listing found during discovery
-- One row per place_id (deduplicated across jobs)
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL UNIQUE, -- Google Places ID - prevents duplicates cross-job
  nome TEXT NOT NULL,
  segmento segmento_enum NOT NULL,
  cidade TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (length(estado) = 2),
  telefone TEXT,
  instagram TEXT, -- @handle format, without URL
  site TEXT,
  link_gmb TEXT NOT NULL,
  endereco TEXT NOT NULL,
  lat NUMERIC NOT NULL,
  lng NUMERIC NOT NULL,
  raw_data JSONB NOT NULL, -- Raw response from Google Places API
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_job_id ON leads(job_id);
CREATE INDEX idx_leads_place_id ON leads(place_id);
CREATE INDEX idx_leads_telefone ON leads(telefone) WHERE telefone IS NOT NULL;
CREATE INDEX idx_leads_instagram ON leads(instagram) WHERE instagram IS NOT NULL;
CREATE INDEX idx_leads_segmento ON leads(segmento);
CREATE INDEX idx_leads_cidade_estado ON leads(cidade, estado);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);

-- Table: scores
-- Purpose: Scoring results for each lead (separated to allow re-scoring)
-- One score per lead (UNIQUE constraint on lead_id)
CREATE TABLE scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  score_dor INT NOT NULL CHECK (score_dor >= 0 AND score_dor <= 100),
  score_maturidade INT NOT NULL CHECK (score_maturidade >= 0 AND score_maturidade <= 100),
  score_final INT NOT NULL CHECK (score_final >= 0 AND score_final <= 100),
  sinais_dor JSONB NOT NULL, -- e.g., {"poucas_fotos": true, "sem_telefone": false, ...}
  sinais_mat JSONB NOT NULL, -- e.g., {"instagram_ativo": true, "site_proprio": false, ...}
  top_3_problemas TEXT[], -- Array of top 3 problems (max 3 items)
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scores_lead_id ON scores(lead_id);
CREATE INDEX idx_scores_score_final ON scores(score_final DESC);
CREATE INDEX idx_scores_score_dor ON scores(score_dor DESC);
CREATE INDEX idx_scores_score_maturidade ON scores(score_maturidade DESC);
CREATE INDEX idx_scores_calculated_at ON scores(calculated_at DESC);

-- Table: pipeline_status
-- Purpose: Track where each lead is in the post-scoring workflow
-- One status per lead (UNIQUE constraint on lead_id)
CREATE TABLE pipeline_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  status pipeline_status_enum NOT NULL,
  kommo_lead_id TEXT, -- ID returned by Kommo API when pushed
  pushed_at TIMESTAMPTZ, -- When lead was pushed to Kommo
  notes TEXT -- Free-form notes (e.g., reason for manual discard)
);

CREATE INDEX idx_pipeline_status_lead_id ON pipeline_status(lead_id);
CREATE INDEX idx_pipeline_status_status ON pipeline_status(status);
CREATE INDEX idx_pipeline_status_kommo_lead_id ON pipeline_status(kommo_lead_id) WHERE kommo_lead_id IS NOT NULL;
CREATE INDEX idx_pipeline_status_pushed_at ON pipeline_status(pushed_at DESC) WHERE pushed_at IS NOT NULL;

-- Table: opt_outs
-- Purpose: LGPD - Track who requested not to be contacted
-- Checked before any Kommo push
CREATE TABLE opt_outs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone TEXT,
  instagram TEXT,
  email TEXT,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_opt_outs_telefone ON opt_outs(telefone) WHERE telefone IS NOT NULL;
CREATE INDEX idx_opt_outs_instagram ON opt_outs(instagram) WHERE instagram IS NOT NULL;
CREATE INDEX idx_opt_outs_email ON opt_outs(email) WHERE email IS NOT NULL;
CREATE INDEX idx_opt_outs_created_at ON opt_outs(created_at DESC);

-- ============================================================================
-- CONSTRAINTS & RULES
-- ============================================================================

-- Ensure at least one contact method in opt_outs
ALTER TABLE opt_outs ADD CONSTRAINT opt_outs_at_least_one_contact
  CHECK (telefone IS NOT NULL OR instagram IS NOT NULL OR email IS NOT NULL);

-- Ensure at least one contact method in leads
ALTER TABLE leads ADD CONSTRAINT leads_at_least_site_or_telefone
  CHECK (site IS NOT NULL OR telefone IS NOT NULL);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE jobs IS 'Each prospecting job execution (segment + city combination)';
COMMENT ON TABLE leads IS 'Individual GMB listings discovered during a job';
COMMENT ON TABLE scores IS 'Scoring results for each lead (pain × maturity)';
COMMENT ON TABLE pipeline_status IS 'Post-scoring workflow status for each lead';
COMMENT ON TABLE opt_outs IS 'LGPD opt-out records - checked before Kommo push';

COMMENT ON COLUMN jobs.estado IS 'Brazilian state code (2 chars): SP, MG, RJ, PR, SC, RS';
COMMENT ON COLUMN jobs.status IS 'Job workflow state: pending → discovering → scoring → enriching → completed/failed';
COMMENT ON COLUMN leads.place_id IS 'Google Places API ID - unique across jobs to prevent duplicates';
COMMENT ON COLUMN leads.raw_data IS 'Raw response from Google Places API (for debugging and re-scoring)';
COMMENT ON COLUMN scores.score_final IS 'Calculated as (score_dor/100) × (score_maturidade/100) × 100';
COMMENT ON COLUMN pipeline_status.status IS 'Current stage in post-scoring workflow';
COMMENT ON COLUMN pipeline_status.kommo_lead_id IS 'ID returned by Kommo API when lead was pushed';
COMMENT ON COLUMN opt_outs.reason IS 'Reason for opt-out (e.g., "solicitado pelo lead", "não contatar", etc.)';
