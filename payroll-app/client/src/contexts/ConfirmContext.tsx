import React, { useState, useCallback, useRef } from 'react';
import ConfirmModal from '../components/common/ConfirmModal';
import { ConfirmContext } from './ConfirmContextDefinition';
import type { ConfirmOptions } from '../types';

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  isDestructive: boolean;
  showCancel: boolean;
}

export const ConfirmProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<ConfirmState>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'OK',
    cancelLabel: 'キャンセル',
    isDestructive: false,
    showCancel: true,
  });

  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback(
    ({
      title,
      message,
      confirmLabel,
      cancelLabel,
      isDestructive,
      showCancel = true,
    }: ConfirmOptions) => {
      return new Promise<boolean>((resolve) => {
        setState({
          isOpen: true,
          title: title || '確認',
          message: message || '本当によろしいですか？',
          confirmLabel: confirmLabel || 'OK',
          cancelLabel: cancelLabel || 'キャンセル',
          isDestructive: isDestructive || false,
          showCancel: showCancel,
        });
        resolveRef.current = resolve;
      });
    },
    [],
  );

  const handleClose = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
    if (resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
    }
  }, []);

  const handleConfirm = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
    if (resolveRef.current) {
      resolveRef.current(true);
      resolveRef.current = null;
    }
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmModal
        isOpen={state.isOpen}
        onClose={handleClose}
        onConfirm={handleConfirm}
        title={state.title}
        message={state.message}
        confirmLabel={state.confirmLabel}
        cancelLabel={state.cancelLabel}
        isDestructive={state.isDestructive}
        showCancel={state.showCancel}
      />
    </ConfirmContext.Provider>
  );
};
