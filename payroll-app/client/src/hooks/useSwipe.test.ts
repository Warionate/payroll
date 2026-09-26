import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { useSwipe } from './useSwipe';

describe('useSwipe', () => {
  it('should call onSwipeLeft when swiping left', () => {
    const onSwipeLeft = vi.fn();
    const { result } = renderHook(() => useSwipe({ onSwipeLeft }));

    act(() => {
      result.current.onTouchStart({
        targetTouches: [{ clientX: 100 } as unknown as Touch],
      } as unknown as React.TouchEvent);
    });

    act(() => {
      result.current.onTouchMove({
        targetTouches: [{ clientX: 40 } as unknown as Touch],
      } as unknown as React.TouchEvent); // Moved 60px left
    });

    act(() => {
      result.current.onTouchEnd();
    });

    expect(onSwipeLeft).toHaveBeenCalled();
  });

  it('should call onSwipeRight when swiping right', () => {
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() => useSwipe({ onSwipeRight }));

    act(() => {
      result.current.onTouchStart({
        targetTouches: [{ clientX: 40 } as unknown as Touch],
      } as unknown as React.TouchEvent);
    });

    act(() => {
      result.current.onTouchMove({
        targetTouches: [{ clientX: 100 } as unknown as Touch],
      } as unknown as React.TouchEvent); // Moved 60px right
    });

    act(() => {
      result.current.onTouchEnd();
    });

    expect(onSwipeRight).toHaveBeenCalled();
  });

  it('should not call handlers if swipe is below threshold', () => {
    const onSwipeLeft = vi.fn();
    const { result } = renderHook(() => useSwipe({ onSwipeLeft, threshold: 100 }));

    act(() => {
      result.current.onTouchStart({
        targetTouches: [{ clientX: 100 } as unknown as Touch],
      } as unknown as React.TouchEvent);
    });

    act(() => {
      result.current.onTouchMove({
        targetTouches: [{ clientX: 50 } as unknown as Touch],
      } as unknown as React.TouchEvent); // Moved 50px left
    });

    act(() => {
      result.current.onTouchEnd();
    });

    expect(onSwipeLeft).not.toHaveBeenCalled();
  });
});
