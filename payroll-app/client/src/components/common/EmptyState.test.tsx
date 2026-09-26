import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import EmptyState from './EmptyState';
import type { LucideIcon } from 'lucide-react';
import type { SVGProps } from 'react';

// Mock Lucide icon
const MockIcon = ((props: SVGProps<SVGSVGElement>) => (
  <svg data-testid="mock-icon" {...props} />
)) as unknown as LucideIcon;

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="No Data" description="Please add some data." />);
    expect(screen.getByText('No Data')).toBeInTheDocument();
    expect(screen.getByText('Please add some data.')).toBeInTheDocument();
  });

  it('renders icon', () => {
    render(<EmptyState icon={MockIcon} title="No Data" />);
    expect(screen.getByTestId('mock-icon')).toBeInTheDocument();
  });

  it('renders action button', () => {
    render(<EmptyState title="No Data" action={<button>Add New</button>} />);
    expect(screen.getByText('Add New')).toBeInTheDocument();
  });

  it('applies size classes', () => {
    const { container } = render(<EmptyState title="Gap Check" size="sm" />);
    // Checking if gap class from size config is applied
    expect(container.firstChild).toHaveClass('gap-2');
  });
});
