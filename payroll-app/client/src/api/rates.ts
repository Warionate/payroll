import { apiClient, getData, getResponse } from './client';
import type { RateInput } from '../types';

export const fetchRates = () => apiClient.get('/rates').then(getData);

export const createRate = (data: RateInput) => apiClient.post('/rates', data).then(getResponse);

export const updateRate = (id: number, data: Partial<RateInput>) =>
  apiClient.put(`/rates/${id}`, data).then(getResponse);

export const deleteRate = (id: number) => apiClient.delete(`/rates/${id}`);
