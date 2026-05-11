/**
 * Google Places API Wrapper
 *
 * Implementa subsistema 1 de descoberta:
 * - Text Search: busca fichas GMB por termo
 * - Place Details: extrai todos os campos necessários de uma ficha
 * - Rate limiting: respeita limites do Google
 * - Deduplicação: por google_place_id
 */

import { Lead, Segmento, Estado, SEARCH_TERMS, PLACES_PAGE_SIZE, PLACES_API_TIMEOUT_MS } from './types';

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const BASE_URL = 'https://maps.googleapis.com/maps/api/place';

if (!API_KEY) {
  throw new Error('GOOGLE_PLACES_API_KEY environment variable is not set');
}

/**
 * Interface para resposta do Google Places Text Search
 */
interface GooglePlaceResult {
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
  [key: string]: unknown;
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
async function textSearch(query: string): Promise<{ results: GooglePlaceResult[]; nextPageToken?: string }> {
  const paramsRecord: Record<string, string> = {
    query,
    key: API_KEY!,
    type: 'establishment',
  };
  const params = new URLSearchParams(paramsRecord);

  const url = `${BASE_URL}/textsearch/json?${params}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PLACES_API_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      results?: GooglePlaceResult[];
      next_page_token?: string;
      status: string;
    };

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(`Google Places API returned status ${data.status}`);
    }

    return {
      results: data.results || [],
      nextPageToken: data.next_page_token,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Busca página seguinte via page token
 */
async function textSearchNextPage(pageToken: string): Promise<{ results: GooglePlaceResult[]; nextPageToken?: string }> {
  const paramsRecord: Record<string, string> = {
    page_token: pageToken,
    key: API_KEY!,
  };
  const params = new URLSearchParams(paramsRecord);

  const url = `${BASE_URL}/textsearch/json?${params}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PLACES_API_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      results?: GooglePlaceResult[];
      next_page_token?: string;
      status: string;
    };

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(`Google Places API returned status ${data.status}`);
    }

    return {
      results: data.results || [],
      nextPageToken: data.next_page_token,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extrai detalhes completos de uma ficha via Place Details
 */
async function getPlaceDetails(placeId: string): Promise<GooglePlaceResult> {
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PLACES_API_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.statusText}`);
    }

    const data = (await response.json()) as { result?: GooglePlaceResult; status: string };

    if (data.status !== 'OK') {
      throw new Error(`Google Places API returned status ${data.status}`);
    }

    if (!data.result) {
      throw new Error('No result in Place Details response');
    }

    return data.result;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Processa uma resposta bruta do Google Places e mapeia para nosso tipo Lead
 */
function mapGooglePlaceToLead(
  place: GooglePlaceResult,
  jobId: string,
  segmento: Segmento,
  cidade: string,
  estado: Estado
): Lead {
  const now = new Date().toISOString();

  return {
    id: '', // Preenchido pelo DB (uuid())
    job_id: jobId,
    google_place_id: place.place_id,
    nome: place.name,
    endereco: place.formatted_address,
    telefone: place.formatted_phone_number || null,
    website: place.website || null,
    latitude: place.geometry.location.lat,
    longitude: place.geometry.location.lng,
    tipos_google: place.types || [],
    rating: place.rating || null,
    review_count: place.user_ratings_total || null,
    discovered_at: now,
    updated_at: now,
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
 * 6. Deduplica por google_place_id
 * 7. Retorna array
 */
export async function searchPlaces(
  segmento: Segmento,
  cidade: string,
  estado: Estado,
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
        let places: GooglePlaceResult[];
        let response: { results: GooglePlaceResult[]; nextPageToken?: string };

        // Primeira página ou páginas subsequentes
        if (!pageToken) {
          response = await textSearch(query);
        } else {
          // Aguarda 2s entre requisições de página (rate limiting)
          await delay(2000);
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

            // Rate limiting entre detalhes (200ms)
            await delay(200);
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

      // Rate limiting entre termos (200ms)
      await delay(200);
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
export async function getPlaceDetailsById(placeId: string): Promise<GooglePlaceResult> {
  return getPlaceDetails(placeId);
}
