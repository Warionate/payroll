import { useContext } from 'react';
import { ConfirmContext } from '../contexts/ConfirmContextDefinition';
import type { ConfirmFunction } from '../types';

export function useConfirm(): ConfirmFunction {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
}
