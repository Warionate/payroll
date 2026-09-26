import { render, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ReloadPrompt from './ReloadPrompt';
import { toast } from 'react-hot-toast';
import type { ReactNode } from 'react';

// Hoist mocks to ensure they are available in vi.mock factory
const mocks = vi.hoisted(() => ({
  useRegisterSW: vi.fn(),
  updateServiceWorker: vi.fn(),
  setNeedRefresh: vi.fn(),
}));

// Mock virtual module
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: mocks.useRegisterSW,
}));

// Mock toast
vi.mock('react-hot-toast', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    toast: Object.assign(
      vi.fn(() => {
        // Return a dummy ID
        return 'test-toast-id';
      }),
      {
        dismiss: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
      },
    ),
  };
});

describe('ReloadPrompt', () => {
  const renderToastContent = (toastCall: unknown): ReactNode => {
    if (typeof toastCall !== 'function') return toastCall as ReactNode;
    return (toastCall as (toast: { id: string }) => ReactNode)({ id: 'test-id' });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default behavior: no refresh needed
    mocks.useRegisterSW.mockReturnValue({
      needRefresh: [false, mocks.setNeedRefresh],
      updateServiceWorker: mocks.updateServiceWorker,
    });
  });

  it('does not render anything if needRefresh is false', () => {
    const { container } = render(<ReloadPrompt />);
    expect(container.firstChild).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });

  it('shows toast when needRefresh is true', async () => {
    mocks.useRegisterSW.mockReturnValue({
      needRefresh: [true, mocks.setNeedRefresh],
      updateServiceWorker: mocks.updateServiceWorker,
    });

    render(<ReloadPrompt />);

    await waitFor(() => {
      expect(toast).toHaveBeenCalled();
    });
  });

  it('calls updateServiceWorker when Update button is clicked', async () => {
    mocks.useRegisterSW.mockReturnValue({
      needRefresh: [true, mocks.setNeedRefresh],
      updateServiceWorker: mocks.updateServiceWorker,
    });

    render(<ReloadPrompt />);

    // toast is called with a component or JSX.
    // We need to capture what was passed to toast to interact with it.
    const toastCall = vi.mocked(toast).mock.calls[0][0];

    // If it's a function (functional component), call it to get the JSX
    const toastContent = renderToastContent(toastCall);

    // Render the toast content so we can click buttons
    const { getByText } = render(toastContent);

    fireEvent.click(getByText('アップデート'));

    expect(mocks.updateServiceWorker).toHaveBeenCalledWith(true);
    expect(toast.dismiss).toHaveBeenCalled();
  });

  it('calls setNeedRefresh(false) when Dismiss button is clicked', () => {
    mocks.useRegisterSW.mockReturnValue({
      needRefresh: [true, mocks.setNeedRefresh],
      updateServiceWorker: mocks.updateServiceWorker,
    });

    render(<ReloadPrompt />);

    const toastCall = vi.mocked(toast).mock.calls[0][0];
    const toastContent = renderToastContent(toastCall);
    const { getByText } = render(toastContent);

    fireEvent.click(getByText('後で'));

    expect(mocks.setNeedRefresh).toHaveBeenCalledWith(false);
    expect(toast.dismiss).toHaveBeenCalled();
  });
});
