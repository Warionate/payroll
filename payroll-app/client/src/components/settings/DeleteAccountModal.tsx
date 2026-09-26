import React, { useState } from 'react';
import { AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { useModalAccessibility } from '../../hooks/useModalAccessibility';

interface Props {
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (password: string) => Promise<void> | void;
}

// Caller is expected to mount/unmount this modal so local state resets between opens.
export default function DeleteAccountModal({ isSubmitting, onClose, onConfirm }: Props) {
  const { modalRef } = useModalAccessibility({ isOpen: true, onClose });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!password || isSubmitting) return;
    await onConfirm(password);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 overlay-safe animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-modal-title"
    >
      <div
        ref={modalRef as React.RefObject<HTMLDivElement>}
        className="bg-white rounded-xl shadow-2xl max-w-sm w-full max-h-full overflow-y-auto animate-scale-in"
      >
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-100 p-2 rounded-full text-red-500">
                <AlertTriangle size={24} />
              </div>
              <h3 id="delete-account-modal-title" className="font-bold text-lg text-gray-800">
                アカウント削除
              </h3>
            </div>
            <p className="text-gray-600 leading-relaxed text-sm mb-4">
              本当にアカウントを削除しますか？この操作は取り消せません。
              <br />
              続行するには、現在のパスワードを入力してください。
            </p>
            <label className="block text-xs font-bold text-gray-500 mb-1" htmlFor="delete-password">
              パスワード
            </label>
            <div className="relative">
              <input
                id="delete-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-2 pr-10 border rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-500"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-200 rounded-lg transition-colors text-sm disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!password || isSubmitting}
              className="px-4 py-2 text-white font-bold bg-red-500 hover:bg-red-600 rounded-lg shadow-sm transition-colors text-sm disabled:opacity-50"
            >
              {isSubmitting ? '削除中...' : '削除する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
