import { createContext } from 'react';
import type { ConfirmFunction } from '../types';

export const ConfirmContext = createContext<ConfirmFunction | null>(null);
