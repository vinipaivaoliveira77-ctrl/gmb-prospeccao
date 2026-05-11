import { Lead, Score } from './types';

const KOMMO_API_KEY = process.env.KOMMO_API_KEY;
const BASE_URL = 'https://kommo.com/api/v4';

/**
 * Pushes a prospected lead to Kommo CRM
 *
 * Creates a contact with basic info (name, phone, instagram, site)
 * and a lead in the "Prospecção GMB" pipeline with score and segment data.
 *
 * @param lead - Lead data from Google Places discovery
 * @param score - Scoring evaluation result
 * @returns Object with Kommo contact_id and lead_id
 * @throws Error if contact or lead creation fails
 */
export async function pushLeadToKommo(
  lead: Lead,
  score: Score
): Promise<{ contact_id: number; lead_id: number }> {
  if (!KOMMO_API_KEY) {
    throw new Error('KOMMO_API_KEY environment variable is not set');
  }

  // 1. Create contact
  const contactRes = await fetch(`${BASE_URL}/contacts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KOMMO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: lead.nome,
      phone: lead.telefone ? [{ value: lead.telefone }] : [],
      custom_fields_values: [
        {
          field_id: parseInt(process.env.KOMMO_FIELD_ID_INSTAGRAM || '0'),
          values: [{ value: lead.website || '' }],
        },
        {
          field_id: parseInt(process.env.KOMMO_FIELD_ID_SITE || '0'),
          values: [{ value: lead.website || '' }],
        },
      ],
    }),
  });

  if (!contactRes.ok) {
    throw new Error(
      `Failed to create contact in Kommo: ${contactRes.status} ${contactRes.statusText}`
    );
  }

  const contactData = await contactRes.json();
  const contactId = contactData._embedded?.contacts?.[0]?.id;

  if (!contactId) {
    throw new Error('Failed to extract contact ID from Kommo response');
  }

  // 2. Create lead
  const leadRes = await fetch(`${BASE_URL}/leads`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KOMMO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `GMB Prospect — ${lead.nome}`,
      responsible_user_id: parseInt(process.env.KOMMO_USER_ID || '0'),
      pipeline_id: parseInt(process.env.KOMMO_PIPELINE_ID || '0'),
      status_id: parseInt(process.env.KOMMO_STATUS_ID_NEW || '0'),
      custom_fields_values: [
        {
          field_id: parseInt(process.env.KOMMO_FIELD_ID_SEGMENTO || '0'),
          values: [{ value: lead.google_place_id }],
        },
        {
          field_id: parseInt(process.env.KOMMO_FIELD_ID_CIDADE || '0'),
          values: [{ value: lead.endereco }],
        },
        {
          field_id: parseInt(process.env.KOMMO_FIELD_ID_ESTADO || '0'),
          values: [{ value: '' }],
        },
        {
          field_id: parseInt(process.env.KOMMO_FIELD_ID_SCORE || '0'),
          values: [{ value: String(score.score_dor) }],
        },
        {
          field_id: parseInt(process.env.KOMMO_FIELD_ID_PROBLEMAS || '0'),
          values: [{ value: score.motivo_recusa || '' }],
        },
        {
          field_id: parseInt(process.env.KOMMO_FIELD_ID_LINK || '0'),
          values: [
            {
              value: `https://maps.google.com/?q=${encodeURIComponent(lead.nome)}+${lead.google_place_id}`,
            },
          ],
        },
      ],
    }),
  });

  if (!leadRes.ok) {
    throw new Error(
      `Failed to create lead in Kommo: ${leadRes.status} ${leadRes.statusText}`
    );
  }

  const leadData = await leadRes.json();
  const leadId = leadData._embedded?.leads?.[0]?.id;

  if (!leadId) {
    throw new Error('Failed to extract lead ID from Kommo response');
  }

  return { contact_id: contactId, lead_id: leadId };
}
