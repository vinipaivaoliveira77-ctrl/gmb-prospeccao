import { describe, it, expect } from 'vitest';
import { detectSinaisDor, calculateScoreDor, calculateTop3Problems } from '../lib/scoring';

describe('detectSinaisDor', () => {
  it('retorna todos false quando lead esta completo', () => {
    const lead = {
      telefone: '123',
      raw_data: {
        photos: Array(10).fill({}),
        editorial_summary: {overview: 'x'.repeat(201)},
        formatted_phone_number: '123',
        opening_hours: {open_now: true},
        reviews: [{time: Math.floor(Date.now()/1000), author_response: {text: 'y'}}],
      }
    };
    const sinais = detectSinaisDor(lead);
    expect(sinais).toEqual({
      poucas_fotos: false,
      sem_descricao: false,
      sem_telefone: false,
      sem_horario: false,
      sem_resposta_reviews: false,
    });
  });

  it('retorna poucas_fotos true quando < 10', () => {
    const lead = {
      telefone: '123',
      raw_data: {
        photos: [{}, {}],
        editorial_summary: {overview: 'x'.repeat(201)},
        formatted_phone_number: '123',
        opening_hours: {open_now: true},
        reviews: [{time: Math.floor(Date.now()/1000), author_response: {text: 'y'}}]
      }
    };
    expect(detectSinaisDor(lead).poucas_fotos).toBe(true);
  });

  it('retorna sem_descricao true quando < 200', () => {
    const lead = {
      telefone: '123',
      raw_data: {
        photos: Array(10).fill({}),
        editorial_summary: {overview: 'Short'},
        formatted_phone_number: '123',
        opening_hours: {open_now: true},
        reviews: [{time: Math.floor(Date.now()/1000), author_response: {text: 'y'}}]
      }
    };
    expect(detectSinaisDor(lead).sem_descricao).toBe(true);
  });

  it('retorna sem_telefone true quando ausente', () => {
    const lead = {
      telefone: null,
      raw_data: {
        photos: Array(10).fill({}),
        editorial_summary: {overview: 'x'.repeat(201)},
        formatted_phone_number: undefined,
        opening_hours: {open_now: true},
        reviews: [{time: Math.floor(Date.now()/1000), author_response: {text: 'y'}}]
      }
    };
    expect(detectSinaisDor(lead).sem_telefone).toBe(true);
  });

  it('retorna sem_horario true quando ausente', () => {
    const lead = {
      telefone: '123',
      raw_data: {
        photos: Array(10).fill({}),
        editorial_summary: {overview: 'x'.repeat(201)},
        formatted_phone_number: '123',
        opening_hours: undefined,
        reviews: [{time: Math.floor(Date.now()/1000), author_response: {text: 'y'}}]
      }
    };
    expect(detectSinaisDor(lead).sem_horario).toBe(true);
  });

  it('retorna sem_resposta_reviews true recentes', () => {
    const sixMonthsAgo = Math.floor(Date.now() / 1000) - 180 * 24 * 60 * 60;
    const lead = {
      telefone: '123',
      raw_data: {
        photos: Array(10).fill({}),
        editorial_summary: {overview: 'x'.repeat(201)},
        formatted_phone_number: '123',
        opening_hours: {open_now: true},
        reviews: [{time: sixMonthsAgo + 1000}]
      }
    };
    expect(detectSinaisDor(lead).sem_resposta_reviews).toBe(true);
  });
});

describe('calculateScoreDor', () => {
  it('retorna 0 quando completo', () => {
    const lead = {
      telefone: '123',
      raw_data: {
        photos: Array(10).fill({}),
        editorial_summary: {overview: 'x'.repeat(201)},
        formatted_phone_number: '123',
        opening_hours: {open_now: true},
        reviews: [{time: Math.floor(Date.now()/1000), author_response: {text: 'y'}}]
      }
    };
    expect(calculateScoreDor(lead)).toBe(0);
  });

  it('retorna 20 sem fotos', () => {
    const lead = {
      telefone: '123',
      raw_data: {
        photos: [{}],
        editorial_summary: {overview: 'x'.repeat(201)},
        formatted_phone_number: '123',
        opening_hours: {open_now: true},
        reviews: [{time: Math.floor(Date.now()/1000), author_response: {text: 'y'}}]
      }
    };
    expect(calculateScoreDor(lead)).toBe(20);
  });

  it('retorna 20 descricao < 200', () => {
    const lead = {
      telefone: '123',
      raw_data: {
        photos: Array(10).fill({}),
        editorial_summary: {overview: 'Short'},
        formatted_phone_number: '123',
        opening_hours: {open_now: true},
        reviews: [{time: Math.floor(Date.now()/1000), author_response: {text: 'y'}}]
      }
    };
    expect(calculateScoreDor(lead)).toBe(20);
  });

  it('retorna 20 sem telefone', () => {
    const lead = {
      telefone: null,
      raw_data: {
        photos: Array(10).fill({}),
        editorial_summary: {overview: 'x'.repeat(201)},
        formatted_phone_number: undefined,
        opening_hours: {open_now: true},
        reviews: [{time: Math.floor(Date.now()/1000), author_response: {text: 'y'}}]
      }
    };
    expect(calculateScoreDor(lead)).toBe(20);
  });

  it('retorna 20 sem horario', () => {
    const lead = {
      telefone: '123',
      raw_data: {
        photos: Array(10).fill({}),
        editorial_summary: {overview: 'x'.repeat(201)},
        formatted_phone_number: '123',
        opening_hours: undefined,
        reviews: [{time: Math.floor(Date.now()/1000), author_response: {text: 'y'}}]
      }
    };
    expect(calculateScoreDor(lead)).toBe(20);
  });

  it('retorna 20 sem resposta reviews', () => {
    const sixMonthsAgo = Math.floor(Date.now() / 1000) - 180 * 24 * 60 * 60;
    const lead = {
      telefone: '123',
      raw_data: {
        photos: Array(10).fill({}),
        editorial_summary: {overview: 'x'.repeat(201)},
        formatted_phone_number: '123',
        opening_hours: {open_now: true},
        reviews: [{time: sixMonthsAgo + 1000}]
      }
    };
    expect(calculateScoreDor(lead)).toBe(20);
  });

  it('retorna 100 quando tudo falta', () => {
    const sixMonthsAgo = Math.floor(Date.now() / 1000) - 180 * 24 * 60 * 60;
    const lead = {
      telefone: null,
      raw_data: {
        photos: undefined,
        editorial_summary: {overview: 'Short'},
        formatted_phone_number: undefined,
        opening_hours: undefined,
        reviews: [{time: sixMonthsAgo + 1000}]
      }
    };
    expect(calculateScoreDor(lead)).toBe(100);
  });
});

describe('calculateTop3Problems', () => {
  it('retorna vazio sem sinais', () => {
    const sinais = {poucas_fotos: false, sem_descricao: false, sem_telefone: false, sem_horario: false, sem_resposta_reviews: false};
    expect(calculateTop3Problems(sinais)).toEqual([]);
  });

  it('retorna um', () => {
    const sinais = {poucas_fotos: true, sem_descricao: false, sem_telefone: false, sem_horario: false, sem_resposta_reviews: false};
    expect(calculateTop3Problems(sinais)).toEqual(['Poucas fotos']);
  });

  it('retorna em ordem', () => {
    const sinais = {poucas_fotos: true, sem_descricao: true, sem_telefone: true, sem_horario: true, sem_resposta_reviews: true};
    expect(calculateTop3Problems(sinais)).toEqual(['Poucas fotos', 'Descrição vazia', 'Sem telefone']);
  });

  it('retorna maximo 3', () => {
    const sinais = {poucas_fotos: true, sem_descricao: true, sem_telefone: true, sem_horario: true, sem_resposta_reviews: false};
    expect(calculateTop3Problems(sinais).length).toBeLessThanOrEqual(3);
  });
});
