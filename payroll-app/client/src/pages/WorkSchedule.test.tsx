import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WorkSchedule from './WorkSchedule';
import { useConfirm } from '../hooks/useConfirm';
import type { ConfirmFunction, PatternAssignment } from '../types';

// Mock dependencies
vi.mock('../hooks/useWorkLogs', () => ({
  useWorkLogs: vi.fn(() => ({ data: [], isLoading: false })),
  useWorkLogMutation: vi.fn(() => ({
    createMutation: { mutateAsync: vi.fn() },
    updateMutation: { mutateAsync: vi.fn() },
    deleteMutation: { mutateAsync: vi.fn() },
    statusMutation: { mutateAsync: vi.fn() },
  })),
}));

const mockPatternsData = [
  {
    id: 1,
    name: 'Default Pattern',
    is_default: 1,
    slots: [{ id: 101, period_name: '1限', start_time: '17:00', end_time: '18:30' }],
  },
];
const mockPatternAssignmentsData: PatternAssignment[] = [];

vi.mock('../hooks/usePatterns', () => ({
  useFixedShiftMutation: vi.fn(() => ({
    applyMutation: { mutateAsync: vi.fn() },
  })),
  usePatterns: vi.fn(() => ({
    data: mockPatternsData,
    isLoading: false,
  })),
  usePatternAssignments: vi.fn(() => ({
    data: mockPatternAssignmentsData,
    isLoading: false,
  })),
}));

vi.mock('../hooks/useConfirm', () => ({
  useConfirm: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
  useQuery: vi.fn(() => ({ data: [], isLoading: false })),
  useMutation: vi.fn(() => ({ mutateAsync: vi.fn() })),
  keepPreviousData: undefined,
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

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: { id: 1 } })),
}));

// Import mocked hooks to set return values
import { useFixedShiftMutation } from '../hooks/usePatterns';

describe('WorkSchedule', () => {
  const mockConfirm = vi.fn() as unknown as ConfirmFunction & {
    mockResolvedValue: (value: boolean) => void;
  };
  const mockApplyMutation = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useConfirm).mockReturnValue(mockConfirm);
    vi.mocked(useFixedShiftMutation).mockReturnValue({
      applyMutation: { mutateAsync: mockApplyMutation },
    } as unknown as ReturnType<typeof useFixedShiftMutation>);
  });

  it('should render correctly', () => {
    render(<WorkSchedule />);
    expect(screen.getByText(/年/)).toBeInTheDocument(); // Header date
    expect(screen.getByText('シフト反映')).toBeInTheDocument();
  });

  it('should trigger bulk shift application when confirmed', async () => {
    mockConfirm.mockResolvedValue(true);
    mockApplyMutation.mockResolvedValue({ count: 5 });

    render(<WorkSchedule />);

    const applyButton = screen.getByText('シフト反映');
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalled();
      expect(mockApplyMutation).toHaveBeenCalled();
    });
  });

  it('should NOT trigger bulk shift application when cancelled', async () => {
    mockConfirm.mockResolvedValue(false);

    render(<WorkSchedule />);

    const applyButton = screen.getByText('シフト反映');
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalled();
      expect(mockApplyMutation).not.toHaveBeenCalled();
    });
  });
});
