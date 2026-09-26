import clsx from 'clsx';
import { LucideIcon } from 'lucide-react';

interface Props {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = 'md',
  className,
}: Props) {
  const sizeConfig = {
    sm: { icon: 32, title: 'text-sm', desc: 'text-xs', gap: 'gap-2', padding: 'py-6' },
    md: { icon: 48, title: 'text-base', desc: 'text-sm', gap: 'gap-3', padding: 'py-12' },
    lg: { icon: 64, title: 'text-lg', desc: 'text-base', gap: 'gap-4', padding: 'py-16' },
  };

  const config = sizeConfig[size];

  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center',
        config.gap,
        config.padding,
        className,
      )}
      role="status"
      aria-label={title}
    >
      {Icon && (
        <div className="text-gray-300">
          <Icon size={config.icon} strokeWidth={1.5} aria-hidden="true" />
        </div>
      )}

      {title && <h3 className={clsx('font-bold text-gray-500', config.title)}>{title}</h3>}

      {description && <p className={clsx('text-gray-400 max-w-sm', config.desc)}>{description}</p>}

      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
