/**
 * Google Places API Wrapper
 *
 * Implementa subsistema 1 de descoberta:
 * - Text Search: busca fichas GMB por termo
 * - Place Details: extrai todos os campos necessários de uma ficha
 * - Rate limiting: respeita limites do Google
 * - Deduplicação: por place_id
 */

import { Lead, Segment, SEARCH_TERMS, GooglePlace, RATE_LIMIT_CONFIG } from './types';

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const BASE_URL = 'https://maps.googleapis.com/maps/api/place';

if (!API_KEY) {
  throw new Error('GOOGLE_PLACES_API_KEY environment variable is not set');
}

/**
 * Delay helper para rate limiting
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Busca fichas GMB via Text Search
 * Retorna place_id + dados básicos + token para próxima página
 */
async function textSearch(query: string, locationBias?: { lat: number; lng: number }): Promise<{ results: GooglePlace[]; nextPageToken?: string }> {
  const paramsRecord: Record<string, string> = {
    query,
    key: API_KEY!,
    type: 'establishment',
  };
  const params = new URLSearchParams(paramsRecord);

  // Se temos viés de localização, adiciona
  if (locationBias) {
    params.append('location', `${locationBias.lat},${locationBias.lng}`);
    params.append('radius', '50000'); // ~50km de raio
  }

  const url = `${BASE_URL}/textsearch/json?${params}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Google Places API error: ${response.statusText}`);
  }

  const data = await response.json() as { results?: GooglePlace[]; next_page_token?: string; status: string };

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places API returned status ${data.status}`);
  }

  return {
    results: data.results || [],
    nextPageToken: data.next_page_token,
  };
}

/**
 * Busca página seguinte via page token
 */
async function textSearchNextPage(pageToken: string): Promise<{ results: GooglePlace[]; nextPageToken?: string }> {
  const paramsRecord: Record<string, string> = {
    page_token: pageToken,
    key: API_KEY!,
  };
  const params = new URLSearchParams(paramsRecord);

  const url = `${BASE_URL}/textsearch/json?${params}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Google Places API error: ${response.statusText}`);
  }

  const data = await response.json() as { results?: GooglePlace[]; next_page_token?: string; status: string };

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places API returned status ${data.status}`);
  }

  return {
    results: data.results || [],
    nextPageToken: data.next_page_token,
  };
}

/**
 * Extrai detalhes completos de uma ficha via Place Details
 */
async function getPlaceDetails(placeId: string): Promise<GooglePlace> {
  const paramsRecord: Record<string, string> = {
    place_id: placeId,
    key: API_KEY!,
    fields: [
      'place_id',
      'name',
      'formatted_address',
      'geometry',
      'formatted_phone_number',
      'website',
      'opening_hours',
      'photos',
      'reviews',
      'editorial_summary',
      'rating',
      'user_ratings_total',
      'types',
      'url',
    ].join(','),
  };
  const params = new URLSearchParams(paramsRecord);

  const url = `${BASE_URL}/details/json?${params}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Google Places API error: ${response.statusText}`);
  }

  const data = await response.json() as { result?: GooglePlace; status: string };

  if (data.status !== 'OK') {
    throw new Error(`Google Places API returned status ${data.status}`);
  }

  if (!data.result) {
    throw new Error('No result in Place Details response');
  }

  return data.result;
}

/**
 * Processa uma resposta bruta do Google Places e mapeia para nosso tipo Lead
 */
function mapGooglePlaceToLead(
  place: GooglePlace,
  jobId: string,
  segmento: Segment,
  cidade: string,
  estado: string
): Lead {
  return {
    id: '', // Preenchido pelo DB
    job_id: jobId,
    place_id: place.place_id,
    nome: place.name,
    segmento,
    cidade,
    estado: estado as any,
    telefone: place.formatted_phone_number || null,
    instagram: null, // Preenchido na Fase 2 (enriquecimento)
    site: place.website || null,
    link_gmb: place.url || `https://www.google.com/maps/search/${encodeURIComponent(place.name)}/data=!4m2!3m1!1s${place.place_id}`,
    endereco: place.formatted_address,
    lat: place.geometry.location.lat,
    lng: place.geometry.location.lng,
    raw_data: place, // Guarda resposta completa
    created_at: new Date().toISOString(),
  };
}

/**
 * Função principal: buscar todas as fichas GMB para um segmento + cidade
 *
 * @param segmento Tipo de negócio (odonto, medico, estetica)
 * @param cidade Cidade de busca
 * @param estado Estado (2 chars: SP, MG, etc)
 * @param jobId ID do job para rastreabilidade
 * @returns Array de Leads mapeados
 *
 * Algoritmo:
 * 1. Para cada termo de busca do segmento
 * 2. Faz Text Search com query = "{termo} em {cidade}, {estado}"
 * 3. Pagina resultados (até ~60 por query = 3 páginas × 20 resultados)
 * 4. Para cada resultado, faz Place Details
 * 5. Mapeia para Lead
 * 6. Deduplica por place_id
 * 7. Retorna array
 */
export async function searchPlaces(
  segmento: Segment,
  cidade: string,
  estado: string,
  jobId: string
): Promise<Lead[]> {
  const terms = SEARCH_TERMS[segmento];
  const leads: Lead[] = [];
  const seenPlaceIds = new Set<string>();

  for (const term of terms) {
    // Query formatada: "dentista em Joinville, SC"
    const query = `${term} em ${cidade}, ${estado}`;

    console.log(`[searchPlaces] Buscando: ${query}`);

    try {
      let pageToken: string | undefined;
      let pageCount = 1;

      // Loop de paginação: continua até não ter próxima página ou atingir 3 páginas
      do {
        let places: GooglePlace[];
        let response: { results: GooglePlace[]; nextPageToken?: string };

        // Primeira página ou páginas subsequentes
        if (!pageToken) {
          response = await textSearch(query);
        } else {
          // Aguarda 2s entre requisições de página (rate limiting)
          await delay(RATE_LIMIT_CONFIG.PAGINATION_DELAY_MS);
          response = await textSearchNextPage(pageToken);
        }

        places = response.results;

        // Processa página atual
        for (const place of places) {
          if (seenPlaceIds.has(place.place_id)) {
            console.log(`[searchPlaces] Deduplicado: ${place.place_id}`);
            continue;
          }

          try {
            // Extrai detalhes completos
            console.log(`[searchPlaces] Buscando detalhes: ${place.place_id}`);
            const fullPlace = await getPlaceDetails(place.place_id);

            // Mapeia para Lead
            const lead = mapGooglePlaceToLead(fullPlace, jobId, segmento, cidade, estado);
            leads.push(lead);
            seenPlaceIds.add(place.place_id);

            // Rate limiting entre detalhes
            await delay(RATE_LIMIT_CONFIG.DELAY_MS);
          } catch (err) {
            console.error(`[searchPlaces] Erro ao buscar detalhes de ${place.place_id}:`, err);
            // Continua com próximo lugar
          }
        }

        // Captura token para próxima página
        pageToken = response.nextPageToken;
        pageCount++;

        console.log(`[searchPlaces] Página ${pageCount - 1} de "${term}": ${places.length} resultados`);
      } while (pageToken && pageCount < 4); // Max 3 páginas (até ~180 resultados)

      console.log(`[searchPlaces] Concluído termo "${term}": ${leads.length} leads únicos até agora`);

      // Rate limiting entre termos
      await delay(RATE_LIMIT_CONFIG.DELAY_MS);
    } catch (err) {
      console.error(`[searchPlaces] Erro na busca "${query}":`, err);
      // Continua com próximo termo
    }
  }

  console.log(`[searchPlaces] Total de leads encontrados para ${segmento}/${cidade}/${estado}: ${leads.length}`);
  return leads;
}


/**
 * Função para obter detalhes de um lugar específico (útil para re-fetch)
 */
export async function getPlaceDetailsById(placeId: string): Promise<GooglePlace> {
  return getPlaceDetails(placeId);
}
