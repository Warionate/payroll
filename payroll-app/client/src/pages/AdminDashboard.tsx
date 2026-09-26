import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Users, Lock } from 'lucide-react';
import { useUsers, useUserMutation } from '../hooks/useUsers';
import {
  usePatterns,
  usePatternMutation,
  usePatternAssignments,
  usePatternAssignmentMutation,
} from '../hooks/usePatterns';
import { useScheduleEvents, useScheduleEventMutation } from '../hooks/useScheduleEvents';
import { toast } from 'react-hot-toast';
import { formatApiError } from '../utils/apiError';
import { useConfirm } from '../hooks/useConfirm';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

import type { User, ScheduleSlot, CreateScheduleEventInput } from '../types';
import type { RefObject } from 'react';

interface PasswordResetModalProps {
  resetUsername: string;
  newPassword: string;
  setNewPassword: (value: string) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

// Components
import UserManagementTable from '../components/admin/UserManagementTable';
import PatternManagement from '../components/admin/PatternManagement';
import GlobalAssignment from '../components/admin/GlobalAssignment';
import ScheduleEventManagement from '../components/admin/ScheduleEventManagement';
import BroadcastForm from '../components/broadcast/BroadcastForm';
import BroadcastList from '../components/broadcast/BroadcastList';

function AdminDashboard() {
  const { user } = useAuth();
  const confirm = useConfirm();

  // Data Fetching
  const { data: users = [], isLoading: usersLoading } = useUsers();
  const { data: patterns = [], isLoading: patternsLoading } = usePatterns();
  const { data: assignments = [], isLoading: assignmentsLoading } = usePatternAssignments();
  const { data: scheduleEvents = [], isLoading: scheduleEventsLoading } = useScheduleEvents();

  // Mutations
  const {
    deleteMutation: deleteUserMutation,
    updatePasswordMutation,
    updateRoleMutation,
  } = useUserMutation();
  const {
    createPatternMutation,
    updatePatternMutation,
    deletePatternMutation,
    setPatternArchivedMutation,
    createSlotMutation,
    createBulkSlotsMutation,
    updateSlotMutation,
    deleteSlotMutation,
  } = usePatternMutation();
  const { createMutation: createAssignmentMutation, deleteMutation: deleteAssignmentMutation } =
    usePatternAssignmentMutation();
  const {
    createMutation: createScheduleEventMutation,
    updateMutation: updateScheduleEventMutation,
    deleteMutation: deleteScheduleEventMutation,
  } = useScheduleEventMutation();

  // Password Reset State (kept in parent to control modal)
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetUsername, setResetUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);

  useEffect(() => {
    if (showResetModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showResetModal]);

  // --- User Management Handlers ---
  const handleDeleteUser = async (id: number) => {
    if (
      await confirm({
        title: 'ユーザー削除',
        message:
          '本当にこのユーザーを削除しますか？\n※ユーザーに関連する全てのデータ（給与設定、勤務ログ、固定シフト）が削除されます。',
        isDestructive: true,
      })
    ) {
      try {
        await deleteUserMutation.mutateAsync({ id });
        toast.success('ユーザーを削除しました');
      } catch (error: unknown) {
        toast.error(formatApiError(error, '削除に失敗しました'));
      }
    }
  };

  const handleUpdateRole = async (targetUser: User) => {
    if (
      await confirm({
        title: '権限変更',
        message: `${targetUser.username} の権限を ${targetUser.role === 'admin' ? '一般' : '管理者'} に変更しますか？`,
        isDestructive: false,
      })
    ) {
      try {
        await updateRoleMutation.mutateAsync({
          id: targetUser.id,
          role: targetUser.role === 'admin' ? 'user' : 'admin',
        });
        toast.success('権限を変更しました');
      } catch (error: unknown) {
        console.error('Role update failed:', error);
        toast.error('権限変更に失敗しました');
      }
    }
  };

  const openResetModal = (id: number, username: string) => {
    setResetUserId(id);
    setResetUsername(username);
    setNewPassword('');
    setShowResetModal(true);
  };

  const submitResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newPassword) return;

    try {
      await updatePasswordMutation.mutateAsync({ id: resetUserId!, password: newPassword });
      toast.success(`${resetUsername} さんのパスワードを変更しました。`);
      setShowResetModal(false);
    } catch (error: unknown) {
      toast.error(formatApiError(error, 'パスワード変更に失敗しました'));
    }
  };

  // --- Pattern Management Handlers ---
  const handleCreatePattern = async (name: string) => {
    try {
      await createPatternMutation.mutateAsync(name);
      toast.success('パターンを作成しました');
    } catch (error: unknown) {
      console.error('Pattern creation failed:', error);
      toast.error('パターン作成に失敗しました');
    }
  };

  const handleUpdatePattern = async (id: number, name: string) => {
    try {
      await updatePatternMutation.mutateAsync({ id, name });
      toast.success('パターン名を更新しました');
    } catch (error: unknown) {
      console.error('Pattern update failed:', error);
      toast.error('パターン名の更新に失敗しました');
    }
  };

  const handleDeletePattern = async (id: number) => {
    if (
      await confirm({
        title: 'パターン削除',
        message: 'パターンを削除しますか？(紐づく時間割も削除されます)',
        isDestructive: true,
      })
    ) {
      try {
        await deletePatternMutation.mutateAsync(id);
        toast.success('パターンを削除しました');
      } catch (error) {
        console.error('Pattern deletion failed:', error);
        toast.error('パターン削除に失敗しました');
      }
    }
  };

  const handleArchivePattern = async (id: number, archived: boolean) => {
    if (
      !(await confirm({
        title: archived ? 'パターンをアーカイブ' : 'アーカイブを解除',
        message: archived
          ? 'このパターンをアーカイブしますか？\n適用期間設定の選択欄に表示されなくなります。'
          : 'このパターンのアーカイブを解除しますか？',
        isDestructive: false,
      }))
    )
      return;
    try {
      await setPatternArchivedMutation.mutateAsync({ id, archived });
      toast.success(archived ? 'パターンをアーカイブしました' : 'アーカイブを解除しました');
    } catch (error) {
      console.error('Pattern archive failed:', error);
      toast.error('処理に失敗しました');
    }
  };

  const handleCreateSlot = async (data: {
    period_name: string;
    start_time: string;
    end_time: string;
    pattern_id: number;
  }) => {
    try {
      await createSlotMutation.mutateAsync(data);
      toast.success('コマを追加しました');
    } catch (error: unknown) {
      console.error('Slot creation failed:', error);
      toast.error('コマ追加に失敗しました');
    }
  };

  const handleCreateBulkSlots = async (data: {
    pattern_id: number;
    slots: Array<{ period_name: string; start_time: string; end_time: string }>;
  }) => {
    try {
      await createBulkSlotsMutation.mutateAsync(data);
      toast.success(`${data.slots.length}コマを一括追加しました`);
    } catch (error) {
      console.error('Bulk slot creation failed:', error);
      toast.error('一括追加に失敗しました');
    }
  };

  const handleUpdateSlot = async (id: number, data: Partial<ScheduleSlot>) => {
    try {
      await updateSlotMutation.mutateAsync({ id, ...data });
      toast.success('コマを更新しました');
    } catch (error) {
      console.error('Slot update failed:', error);
      toast.error('コマ更新に失敗しました');
    }
  };

  const handleDeleteSlot = async (id: number) => {
    if (
      await confirm({ title: 'コマ削除', message: 'このコマを削除しますか？', isDestructive: true })
    ) {
      try {
        await deleteSlotMutation.mutateAsync(id);
        toast.success('コマを削除しました');
      } catch (error) {
        console.error('Slot deletion failed:', error);
        toast.error('コマ削除に失敗しました');
      }
    }
  };

  // --- Global Assignment Handlers ---
  const handleAssign = async (data: {
    start_date: string;
    end_date: string;
    pattern_id: string;
  }) => {
    try {
      const result = await createAssignmentMutation.mutateAsync(data);
      const deletedCount = result?.deleted_work_logs || 0;
      if (deletedCount > 0) {
        toast.success(`パターンを適用しました（${deletedCount}件の予定済み授業登録を削除）`);
      } else {
        toast.success('パターンを適用しました');
      }
    } catch (error) {
      console.error('Failed to assign pattern:', error);
      toast.error('パターンの適用に失敗しました');
    }
  };

  const handleDeleteAssignment = async (id: number) => {
    if (
      !(await confirm({ title: '削除確認', message: '本当に削除しますか？', isDestructive: true }))
    )
      return;
    try {
      await deleteAssignmentMutation.mutateAsync(id);
      toast.success('割り当てを削除しました');
    } catch (error) {
      console.error('Failed to delete assignment:', error);
      toast.error('削除に失敗しました');
    }
  };

  // --- Schedule Event Handlers ---
  const handleCreateScheduleEvent = async (data: CreateScheduleEventInput) => {
    try {
      await createScheduleEventMutation.mutateAsync(data);
      toast.success('予定を登録しました');
    } catch (error: unknown) {
      toast.error(formatApiError(error, '登録に失敗しました'));
      throw error;
    }
  };

  const handleUpdateScheduleEvent = async (id: number, data: CreateScheduleEventInput) => {
    try {
      await updateScheduleEventMutation.mutateAsync({ id, data });
      toast.success('予定を更新しました');
    } catch (error: unknown) {
      toast.error(formatApiError(error, '更新に失敗しました'));
      throw error;
    }
  };

  const handleDeleteScheduleEvent = async (id: number) => {
    if (
      !(await confirm({
        title: '予定を削除',
        message: 'この予定を削除しますか？',
        isDestructive: true,
      }))
    )
      return;
    try {
      await deleteScheduleEventMutation.mutateAsync(id);
      toast.success('予定を削除しました');
    } catch (error: unknown) {
      toast.error(formatApiError(error, '削除に失敗しました'));
    }
  };

  if (!user || user.role !== 'admin') return <div>アクセス権限がありません</div>;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-10 pb-24 relative">
      <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
        <Users className="text-blue-600" />
        管理者ダッシュボード
      </h1>

      <UserManagementTable
        users={users}
        isLoading={usersLoading}
        currentUser={user!}
        onDeleteUser={handleDeleteUser}
        onUpdateRole={handleUpdateRole}
        onOpenResetModal={openResetModal}
      />

      <BroadcastForm />

      <BroadcastList />

      <GlobalAssignment
        assignments={assignments}
        patterns={patterns}
        isLoading={assignmentsLoading}
        onAssign={handleAssign}
        onDeleteAssignment={handleDeleteAssignment}
      />

      <ScheduleEventManagement
        events={scheduleEvents}
        isLoading={scheduleEventsLoading}
        onCreate={handleCreateScheduleEvent}
        onUpdate={handleUpdateScheduleEvent}
        onDelete={handleDeleteScheduleEvent}
      />

      <PatternManagement
        patterns={patterns}
        isLoading={patternsLoading}
        onCreatePattern={handleCreatePattern}
        onUpdatePattern={handleUpdatePattern}
        onDeletePattern={handleDeletePattern}
        onArchivePattern={handleArchivePattern}
        onCreateSlot={handleCreateSlot}
        onCreateBulkSlots={handleCreateBulkSlots}
        onUpdateSlot={handleUpdateSlot}
        onDeleteSlot={handleDeleteSlot}
      />

      {/* Password Reset Modal */}
      {showResetModal && (
        <PasswordResetModal
          resetUsername={resetUsername}
          newPassword={newPassword}
          setNewPassword={setNewPassword}
          onClose={() => setShowResetModal(false)}
          onSubmit={submitResetPassword}
        />
      )}
    </div>
  );
}

function PasswordResetModal({
  resetUsername,
  newPassword,
  setNewPassword,
  onClose,
  onSubmit,
}: PasswordResetModalProps) {
  const { modalRef } = useModalAccessibility({ isOpen: true, onClose });

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center overlay-safe z-[100]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-reset-title"
    >
      <div
        ref={modalRef as React.Ref<HTMLDivElement>}
        className="bg-white p-6 rounded-xl shadow-xl w-96 max-w-full max-h-full overflow-y-auto"
      >
        <h3 id="password-reset-title" className="text-lg font-bold mb-4 flex items-center gap-2">
          <Lock size={20} className="text-blue-600" />
          パスワード変更
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          <span className="font-bold">{resetUsername}</span>{' '}
          さんの新しいパスワードを入力してください。
        </p>
        <form onSubmit={onSubmit}>
          <input
            type="password"
            className="w-full p-2 border rounded-lg mb-4"
            placeholder="新しいパスワード"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded-lg"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white font-bold hover:bg-blue-700 rounded-lg"
            >
              変更
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminDashboard;
