import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './client';
import type { Incident } from './types';

export function useIncidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await api.listIncidents({ page_size: 100 });
      setIncidents(result.data);
    } catch (err) {
      setError((err as ApiError).message || 'Could not load your reports.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { incidents, loading, error, refresh };
}
