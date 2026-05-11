import React, { useState } from 'react';
import { createJob } from '../lib/api-client';

interface JobFormProps { onSuccess?: () => void; }

export const JobForm: React.FC<JobFormProps> = ({ onSuccess }) => {
  const [segmento, setSegmento] = useState('odonto');
  const [estado, setEstado] = useState('SP');
  const [cidade, setCidade] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await createJob(segmento, cidade, estado);
      setCidade('');
      onSuccess?.();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>Segmento:</label>
        <select value={segmento} onChange={e => setSegmento(e.target.value)}>
          <option value="odonto">Odonto</option>
          <option value="medico">Médico</option>
          <option value="estetica">Estética</option>
        </select>
      </div>

      <div>
        <label>Estado:</label>
        <select value={estado} onChange={e => setEstado(e.target.value)}>
          {['SP', 'MG', 'RJ', 'PR', 'SC', 'RS'].map(st => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>
      </div>

      <div>
        <label>Cidade:</label>
        <input type="text" value={cidade} onChange={e => setCidade(e.target.value)} required placeholder="ex: Joinville" />
      </div>

      <button type="submit" disabled={loading}>{loading ? 'Disparando...' : 'Disparar Varredura'}</button>

      {error && <p style={{ color: 'red' }}>{error}</p>}
    </form>
  );
};
