import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PatternAssignment } from '../../types';

// Mock dependencies
vi.mock('../../api', () => ({
  saveDailyClasses: vi.fn(),
  fetchRates: vi.fn(),
}));

const mockPatternsData = [
  {
    id: 1,
    name: 'Default Pattern',
    is_default: 1,
    slots: [
      { id: 101, period_name: '1限', start_time: '17:00', end_time: '18:30' },
      { id: 102, period_name: '2限', start_time: '18:40', end_time: '20:10' },
    ],
  },
];
const mockPatternAssignmentsData: PatternAssignment[] = [];

vi.mock('../../hooks/usePatterns', () => ({
  usePatterns: vi.fn(() => ({
    data: mockPatternsData,
    isLoading: false,
  })),
  usePatternAssignments: vi.fn(() => ({
    data: mockPatternAssignmentsData,
    isLoading: false,
  })),
}));

vi.mock('react-hot-toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../../hooks/useRates', () => ({
  useRates: vi.fn(() => ({
    data: [
      {
        start_date: '2023-01-01',
        wage_1_student: 1500,
        wage_2_students: 2500,
        wage_3_students: 3500,
        wage_4_students: 4500,
        hourly_wage: 1000,
        allowance_day: 500,
        allowance_gap: 100,
      },
    ],
    isLoading: false,
  })),
}));

vi.mock('../../contexts/AuthContext', () => {
  return {
    useAuth: vi.fn(() => ({ user: { id: 1 } })),
  };
});

import EntryModal from './EntryModal';
import { saveDailyClasses } from '../../api';

describe('EntryModal', () => {
  const mockDate = new Date('2023-04-01');
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn();
  const mockOnRefresh = vi.fn();

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const renderWithContext = (ui: React.ReactElement) => {
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render correctly when open', async () => {
    renderWithContext(
      <EntryModal
        isOpen={true}
        date={mockDate}
        existingLogs={[]}
        onClose={mockOnClose}
        onSave={mockOnSave}
        onUpdateStatus={vi.fn()}
        onDelete={vi.fn()}
        onUpdateLog={vi.fn()}
        onRefresh={mockOnRefresh}
      />,
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('4月1日 (土)')).toBeInTheDocument();
    });

    // Check if slots are rendered
    expect(screen.getByText('1限')).toBeInTheDocument();
    expect(screen.getByText('2限')).toBeInTheDocument();
  });

  it('should allow selecting student count', async () => {
    renderWithContext(
      <EntryModal
        isOpen={true}
        date={mockDate}
        existingLogs={[]}
        onClose={mockOnClose}
        onSave={mockOnSave}
        onUpdateStatus={vi.fn()}
        onDelete={vi.fn()}
        onUpdateLog={vi.fn()}
        onRefresh={mockOnRefresh}
      />,
    );

    await waitFor(() => screen.getByText('1限'));

    // Find "1:1" button for 1st period (1限)
    // There are multiple "1:1" buttons (one for each slot).
    // We need to target the one inside the first slot.
    const buttons = screen.getAllByText('1:1');
    fireEvent.click(buttons[0]);

    // Check if it's selected (active class logic usually changes style, but here we check state indirectly via save)
    // Or check if the button has the active class.
    // In the code: bg-orange-500 text-white
    expect(buttons[0]).toHaveClass('bg-orange-500');
  });

  it('should call saveDailyClasses on save', async () => {
    vi.mocked(saveDailyClasses).mockResolvedValue({});

    renderWithContext(
      <EntryModal
        isOpen={true}
        date={mockDate}
        existingLogs={[]}
        onClose={mockOnClose}
        onSave={mockOnSave}
        onUpdateStatus={vi.fn()}
        onDelete={vi.fn()}
        onUpdateLog={vi.fn()}
        onRefresh={mockOnRefresh}
      />,
    );

    await waitFor(() => screen.getByText('1限'));

    // Select 1 student for 1st period
    const buttons = screen.getAllByText('1:1');
    fireEvent.click(buttons[0]);

    // Click Save
    const saveButton = screen.getByText('スケジュールを保存');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(saveDailyClasses).toHaveBeenCalledWith(
        '2023-04-01',
        expect.arrayContaining([
          expect.objectContaining({
            schedule_slot_id: 101,
            student_count: 1,
            status: 'planned',
          }),
        ]),
        expect.any(Array),
      );
    });

    expect(mockOnRefresh).toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should handle hourly work addition', async () => {
    renderWithContext(
      <EntryModal
        isOpen={true}
        date={mockDate}
        existingLogs={[]}
        onSave={mockOnSave}
        onUpdateStatus={vi.fn()}
        onDelete={vi.fn()}
        onUpdateLog={vi.fn()}
        onClose={mockOnClose}
        onRefresh={mockOnRefresh}
      />,
    );

    await waitFor(() => screen.getByText('+ 規定外を追加'));

    // Open form
    fireEvent.click(screen.getByText('+ 規定外を追加'));

    // Input minutes (default is 60)
    // Change to 90
    fireEvent.click(screen.getByText('90'));

    // Input note
    const noteInput = screen.getByPlaceholderText('備考 (任意)');
    fireEvent.change(noteInput, { target: { value: 'Test Work' } });

    // Save hourly
    const saveButtons = screen.getAllByText('保存');
    // The main save button is "スケジュールを保存", hourly save is "保存"
    // But wait, there might be ambiguity if main button text was just "保存".
    // Main button: "スケジュールを保存"
    // Hourly button: "保存"
    fireEvent.click(saveButtons[0]); // Should be the hourly form save button

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({
          work_type: 'hourly',
          duration_minutes: 90,
          note: 'Test Work',
          date: '2023-04-01',
        }),
      );
    });
  });
});
