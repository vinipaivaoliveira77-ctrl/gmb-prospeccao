/**
 * Worker Entry Point
 *
 * Serviço de prospecção automática que:
 * - Poll jobs com status='pending' a cada 10s
 * - Para cada job: discoverClinics → evaluateLeads → routeLeads
 * - Rastreia progresso: pending → discovering → scoring → completed
 * - Trata erros com fallback para status='failed'
 *
 * Padrão de execução (para cada job):
 * 1. Fetch job do Supabase (status='pending')
 * 2. Mark job como 'discovering'
 * 3. Run discoverClinics → salva leads em DB
 * 4. Mark job como 'evaluating'
 * 5. Run evaluateLeads → calcula scores e salva em DB
 * 6. Run routeLeads → pushes leads qualificados (score >= cutoff) para Kommo
 * 7. Mark job como 'completed' com metadata (total_found, total_pushed, etc)
 * 8. Em caso de erro: mark job como 'failed' com error_message
 */

import { createClient } from '@supabase/supabase-js';
import { discoverClinics } from './services/discovery';
import { evaluateLeads } from './services/evaluation';
import { routeLeads } from '../api/lib/routing';
import { Job, JobStatus, Segmento, Estado } from './lib/types';

/**
 * Inicializa cliente Supabase com credenciais de servidor (service key)
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
 * Atualiza status de um job no Supabase
 */
async function updateJobStatus(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  status: JobStatus,
  metadata?: Record<string, any>
) {
  const update = {
    status,
    updated_at: new Date().toISOString(),
    ...metadata,
  };

  const { error } = await supabase.from('jobs').update(update).eq('id', jobId);

  if (error) {
    throw new Error(`Failed to update job ${jobId}: ${error.message}`);
  }
}

/**
 * Processa um único job de descoberta/avaliação/routing
 *
 * @param jobId ID do job a processar
 * @throws Error se alguma etapa falhar (será tratado por processJob)
 */
async function processJobInternal(supabase: ReturnType<typeof createClient>, jobId: string) {
  // Fetch job
  const { data: job, error: fetchError } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (fetchError || !job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const jobData = job as Job;

  console.log(`[Worker] Processing job ${jobId}:`, {
    segmento: jobData.segmento,
    cidade: jobData.cidade,
    estado: jobData.estado,
  });

  // =========================================================================
  // STEP 1: DISCOVER
  // =========================================================================

  console.log(`[Worker] Step 1/3: Discovering leads...`);
  await updateJobStatus(supabase, jobId, JobStatus.DISCOVERING);

  const leads = await discoverClinics({
    job_id: jobId,
    segmento: jobData.segmento as Segmento,
    cidade: jobData.cidade,
    estado: jobData.estado as Estado,
  });

  console.log(`[Worker] Discovered ${leads.length} leads`);

  if (leads.length === 0) {
    console.log(`[Worker] No leads found. Completing job.`);
    await updateJobStatus(supabase, jobId, JobStatus.COMPLETED, {
      total_found: 0,
      total_pushed: 0,
      completed_at: new Date().toISOString(),
    });
    return;
  }

  // =========================================================================
  // STEP 2: EVALUATE
  // =========================================================================

  console.log(`[Worker] Step 2/3: Evaluating leads...`);
  await updateJobStatus(supabase, jobId, JobStatus.EVALUATING);

  const scores = await evaluateLeads(leads);

  const leadsPassedFilter = scores.filter(s => s.passou_filtro).length;
  console.log(`[Worker] Evaluated ${scores.length} leads. Passed filter: ${leadsPassedFilter}`);

  // =========================================================================
  // STEP 3: ROUTE
  // =========================================================================

  console.log(`[Worker] Step 3/3: Routing leads to Kommo...`);
  await updateJobStatus(supabase, jobId, JobStatus.PUSHING);

  await routeLeads(leads, scores);

  // Query para contar quantos foram efetivamente pushados
  const { data: pushed, error: countError } = await supabase
    .from('pipeline_status')
    .select('id')
    .eq('job_id', jobId)
    .eq('status', 'pushed_to_kommo');

  if (countError) {
    throw new Error(`Failed to count pushed leads: ${countError.message}`);
  }

  const totalPushed = pushed?.length || 0;
  console.log(`[Worker] Routed ${totalPushed} leads to Kommo`);

  // =========================================================================
  // COMPLETION
  // =========================================================================

  console.log(`[Worker] Job ${jobId} completed successfully`);
  await updateJobStatus(supabase, jobId, JobStatus.COMPLETED, {
    leads_discovered: leads.length,
    leads_scored: scores.length,
    leads_passed_filter: leadsPassedFilter,
    total_found: leads.length,
    total_pushed: totalPushed,
    completed_at: new Date().toISOString(),
  });
}

/**
 * Wrapper para processJob que trata erros e atualiza status como 'failed'
 */
async function processJob(supabase: ReturnType<typeof createClient>, jobId: string) {
  try {
    await processJobInternal(supabase, jobId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Worker] Job ${jobId} failed:`, errorMessage);

    await updateJobStatus(supabase, jobId, JobStatus.FAILED, {
      error_message: errorMessage,
    });
  }
}

/**
 * Poll jobs pending e os processa um a um
 */
async function pollAndProcessJobs() {
  const supabase = initSupabaseClient();

  try {
    // Fetch 1 pending job
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('id')
      .eq('status', JobStatus.CREATED)
      .limit(1);

    if (error) {
      console.error(`[Worker] Failed to fetch jobs:`, error.message);
      return;
    }

    if (jobs && jobs.length > 0) {
      const jobId = jobs[0].id;
      console.log(`[Worker] Found job to process: ${jobId}`);
      await processJob(supabase, jobId);
    }
  } catch (error) {
    console.error(`[Worker] Poll error:`, error);
  }
}

/**
 * Inicia o worker e começa o polling a cada 10 segundos
 */
export function startWorker(pollIntervalMs: number = 10000) {
  console.log(`[Worker] Started. Polling every ${pollIntervalMs}ms`);

  setInterval(async () => {
    await pollAndProcessJobs();
  }, pollIntervalMs);

  // Executa uma vez imediatamente
  pollAndProcessJobs().catch(error => {
    console.error(`[Worker] Initial poll failed:`, error);
  });
}

/**
 * Se executado diretamente (não importado), inicia o worker
 */
if (require.main === module) {
  startWorker(10000);
  console.log('[Worker] Running in standalone mode. Press Ctrl+C to stop.');
}

export { processJob, pollAndProcessJobs };
