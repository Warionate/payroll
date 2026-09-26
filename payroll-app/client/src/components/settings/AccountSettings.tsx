import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { User, Lock, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useUserMutation } from '../../hooks/useUsers';
import { toast } from 'react-hot-toast';
import { formatApiError } from '../../utils/apiError';
import { passwordFormSchema, usernameSchema, COMMON_PASSWORDS } from '@payroll/shared';
import DeleteAccountModal from './DeleteAccountModal';
import type { AxiosError } from 'axios';

export default function AccountSettings() {
  const { user, updateUser } = useAuth();
  const { updateProfileMutation, updatePasswordMutation, deleteMutation } = useUserMutation();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Username form with React Hook Form
  const usernameForm = useForm({
    resolver: zodResolver(usernameSchema),
    defaultValues: { username: user?.username || '' },
  });

  // Password form with React Hook Form + Zod
  const passwordForm = useForm({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: { currentPassword: '', password: '', confirmPassword: '' },
  });

  if (!user) return null;

  const handleUpdateProfile = async (data: { username: string }) => {
    try {
      await updateProfileMutation.mutateAsync({ id: user.id, username: data.username });
      updateUser({ username: data.username });
      toast.success('ユーザー名を更新しました');
    } catch (error: unknown) {
      console.error('Profile update failed:', error);
      toast.error('ユーザー名の更新に失敗しました');
    }
  };

  const handleUpdatePassword = async (data: {
    currentPassword: string;
    password: string;
    confirmPassword: string;
  }) => {
    // Additional validation that can't be in Zod
    if (data.password.toLowerCase().includes(user.username.toLowerCase())) {
      passwordForm.setError('password', {
        message: 'パスワードにユーザー名を含めることはできません',
      });
      return;
    }
    if (COMMON_PASSWORDS.includes(data.password.toLowerCase())) {
      passwordForm.setError('password', {
        message: 'そのパスワードは使用できません（推測されやすいパスワードです）',
      });
      return;
    }

    try {
      await updatePasswordMutation.mutateAsync({
        id: user.id,
        password: data.password,
        currentPassword: data.currentPassword,
      });
      toast.success('パスワードを更新しました');
      passwordForm.reset();
    } catch (error: unknown) {
      console.error('Password update failed:', error);
      toast.error(formatApiError(error, 'パスワードの更新に失敗しました'));
    }
  };

  const handleDeleteAccount = async (password: string) => {
    try {
      await deleteMutation.mutateAsync({ id: user.id, password });
      window.location.href = '/login';
    } catch (error) {
      console.error('Account deletion failed:', error);
      const axiosError = error as AxiosError<{ error?: string }>;
      const message =
        axiosError.response?.status === 401
          ? 'パスワードが間違っています'
          : formatApiError(error, 'アカウントの削除に失敗しました');
      toast.error(message);
    }
  };

  return (
    <section>
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <User className="text-purple-600" />
        アカウント設定
      </h2>

      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 space-y-6">
        {/* ユーザー名変更 */}
        <form onSubmit={usernameForm.handleSubmit(handleUpdateProfile)}>
          <label className="block text-xs font-bold text-gray-400 mb-1">ユーザー名</label>
          <div className="flex gap-2">
            <input
              type="text"
              {...usernameForm.register('username')}
              className="flex-1 p-2 border rounded font-bold"
            />
            <button
              type="submit"
              className="bg-purple-600 text-white px-4 rounded-lg font-bold text-sm hover:bg-purple-700"
            >
              更新
            </button>
          </div>
          {usernameForm.formState.errors.username && (
            <p className="text-xs text-red-500 mt-1">
              {usernameForm.formState.errors.username.message}
            </p>
          )}
        </form>

        <hr className="border-gray-100" />

        {/* パスワード変更 */}
        <form onSubmit={passwordForm.handleSubmit(handleUpdatePassword)} className="space-y-3">
          <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
            <Lock size={16} /> パスワード変更
          </h3>
          <div>
            <input
              type="password"
              placeholder="現在のパスワード"
              {...passwordForm.register('currentPassword')}
              className="w-full p-2 border rounded mb-2"
            />
            {passwordForm.formState.errors.currentPassword && (
              <p className="text-xs text-red-500 mb-2">
                {passwordForm.formState.errors.currentPassword.message}
              </p>
            )}
            <input
              type="password"
              placeholder="新しいパスワード"
              {...passwordForm.register('password')}
              className="w-full p-2 border rounded mb-2"
            />
            {passwordForm.formState.errors.password && (
              <p className="text-xs text-red-500 mb-2">
                {passwordForm.formState.errors.password.message}
              </p>
            )}
            <input
              type="password"
              placeholder="パスワード確認"
              {...passwordForm.register('confirmPassword')}
              className="w-full p-2 border rounded"
            />
            {passwordForm.formState.errors.confirmPassword && (
              <p className="text-xs text-red-500 mt-1">
                {passwordForm.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>
          <button
            type="submit"
            className="w-full bg-gray-800 text-white py-2 rounded-lg font-bold text-sm hover:bg-gray-900"
          >
            パスワードを変更
          </button>
        </form>

        <hr className="border-gray-100" />

        {/* アカウント削除 */}
        <div className="pt-2">
          <button
            onClick={() => setShowDeleteModal(true)}
            className="w-full py-2 border border-red-200 text-red-600 rounded-lg font-bold text-sm hover:bg-red-50 flex items-center justify-center gap-2"
          >
            <Trash2 size={16} /> アカウントを削除
          </button>
          <p className="text-[10px] text-red-400 text-center mt-2">
            ※削除すると全てのデータが失われます
          </p>
        </div>
      </div>

      {showDeleteModal && (
        <DeleteAccountModal
          isSubmitting={deleteMutation.isPending}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleDeleteAccount}
        />
      )}
    </section>
  );
}
