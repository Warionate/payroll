import { useState } from 'react';
import LegalModal from '../components/common/LegalModal';

/** 規約・プライバシーポリシーを本文の中から開くとき用 */
export function useLegalModal() {
  const [activeModal, setActiveModal] = useState<'terms' | 'privacy' | null>(null);
  return {
    open: setActiveModal,
    modal: <LegalModal activeModal={activeModal} onClose={() => setActiveModal(null)} />,
  };
}
