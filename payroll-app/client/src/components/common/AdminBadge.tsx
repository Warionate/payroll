import { ShieldCheck } from 'lucide-react';

interface Props {
  size?: number;
  className?: string;
  title?: string;
}

export default function AdminBadge({ size = 14, className = '', title = '管理者' }: Props) {
  return (
    <ShieldCheck
      size={size}
      className={`text-primary-600 shrink-0 inline-block ${className}`}
      aria-label={title}
      role="img"
    />
  );
}
