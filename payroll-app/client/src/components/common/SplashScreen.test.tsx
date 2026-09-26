import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import SplashScreen from './SplashScreen';

describe('SplashScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the brand logo and loading text', () => {
    render(<SplashScreen />);
    expect(screen.getByAltText('Payroll App')).toBeInTheDocument();
    expect(screen.getByText('読み込み中です')).toBeInTheDocument();
  });

  it('hides the slow notice until 15s have passed', () => {
    render(<SplashScreen />);
    expect(screen.queryByText('読み込みに時間がかかっています')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(screen.getByText('読み込みに時間がかかっています')).toBeInTheDocument();
  });
});
