import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LoadingButton from './LoadingButton';

describe('LoadingButton', () => {
  it('renders children correctly', () => {
    render(<LoadingButton>Click me</LoadingButton>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('shows loading state correctly', () => {
    render(
      <LoadingButton loading={true} loadingText="Processing...">
        Click me
      </LoadingButton>,
    );
    expect(screen.getByText('Processing...')).toBeInTheDocument();
    expect(screen.queryByText('Click me')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<LoadingButton onClick={handleClick}>Click me</LoadingButton>);

    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire click when disabled', () => {
    const handleClick = vi.fn();
    render(
      <LoadingButton disabled onClick={handleClick}>
        Click me
      </LoadingButton>,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders with different variants', () => {
    const { rerender } = render(<LoadingButton variant="primary">Primary</LoadingButton>);
    expect(screen.getByRole('button')).toHaveClass('bg-primary-600');

    rerender(<LoadingButton variant="danger">Danger</LoadingButton>);
    expect(screen.getByRole('button')).toHaveClass('bg-red-600');
  });
});
