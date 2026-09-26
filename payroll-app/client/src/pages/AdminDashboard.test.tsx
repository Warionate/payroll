import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdminDashboard from './AdminDashboard';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../hooks/useConfirm';
import type { AuthContextType, ConfirmFunction } from '../types';

// Mock dependencies
vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../hooks/useConfirm', () => ({
  useConfirm: vi.fn(),
}));

vi.mock('../hooks/useUsers', () => ({
  useUsers: vi.fn(() => ({ data: [], isLoading: false })),
  useUserMutation: vi.fn(() => ({
    deleteMutation: { mutateAsync: vi.fn() },
    updatePasswordMutation: { mutateAsync: vi.fn() },
    updateRoleMutation: { mutate: vi.fn() },
  })),
}));

vi.mock('../hooks/usePatterns', () => ({
  usePatterns: vi.fn(() => ({ data: [], isLoading: false })),
  usePatternAssignments: vi.fn(() => ({ data: [], isLoading: false })),
  usePatternMutation: vi.fn(() => ({
    createPatternMutation: { mutateAsync: vi.fn() },
    deletePatternMutation: { mutateAsync: vi.fn() },
    createSlotMutation: { mutateAsync: vi.fn() },
    deleteSlotMutation: { mutateAsync: vi.fn() },
  })),
  usePatternAssignmentMutation: vi.fn(() => ({
    createMutation: { mutateAsync: vi.fn() },
    deleteMutation: { mutateAsync: vi.fn() },
  })),
}));

vi.mock('../hooks/useScheduleEvents', () => ({
  useScheduleEvents: vi.fn(() => ({ data: [], isLoading: false })),
  useScheduleEventMutation: vi.fn(() => ({
    createMutation: { mutateAsync: vi.fn() },
    updateMutation: { mutateAsync: vi.fn() },
    deleteMutation: { mutateAsync: vi.fn() },
  })),
}));

vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../components/broadcast/BroadcastForm', () => ({
  default: () => null,
}));

vi.mock('../components/broadcast/BroadcastList', () => ({
  default: () => null,
}));

// Import mocked hooks
import { usePatternMutation } from '../hooks/usePatterns';

describe('AdminDashboard', () => {
  const mockCreatePattern = vi.fn();
  const mockConfirm = vi.fn() as unknown as ConfirmFunction;
  const mockAuth = (role: 'admin' | 'user'): AuthContextType => ({
    user: { id: 1, username: role, role, created_at: '2026-01-01' },
    loading: false,
    maintenance: false,
    login: vi.fn(),
    loginWithPasskey: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    updateUser: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue(mockAuth('admin'));
    vi.mocked(useConfirm).mockReturnValue(mockConfirm);
    vi.mocked(usePatternMutation).mockReturnValue({
      createPatternMutation: { mutateAsync: mockCreatePattern },
      deletePatternMutation: { mutateAsync: vi.fn() },
      createSlotMutation: { mutateAsync: vi.fn() },
      deleteSlotMutation: { mutateAsync: vi.fn() },
    } as unknown as ReturnType<typeof usePatternMutation>);
  });

  it('should render correctly for admin', () => {
    render(<AdminDashboard />);
    expect(screen.getByText('管理者ダッシュボード')).toBeInTheDocument();
  });

  it('should not render for non-admin', () => {
    vi.mocked(useAuth).mockReturnValue(mockAuth('user'));
    render(<AdminDashboard />);
    expect(screen.getByText('アクセス権限がありません')).toBeInTheDocument();
  });

  it('should create a new pattern', async () => {
    render(<AdminDashboard />);

    const input = screen.getByPlaceholderText('新しいパターン名 (例: 夏期講習)');
    fireEvent.change(input, { target: { value: 'New Pattern' } });

    const button = screen.getByText('追加');
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockCreatePattern).toHaveBeenCalledWith('New Pattern');
    });
  });
});
