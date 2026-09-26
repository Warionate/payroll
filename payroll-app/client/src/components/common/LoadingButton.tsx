import clsx from 'clsx';
import React from 'react';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  icon?: React.ReactNode;
  loadingText?: string;
  type?: 'button' | 'submit' | 'reset';
}

export default function LoadingButton({
  children,
  loading = false,
  disabled = false,
  variant = 'primary',
  size = 'md',
  className,
  icon,
  loadingText,
  type = 'button',
  ...props
}: Props) {
  const isDisabled = disabled || loading;

  const baseStyles =
    'font-bold rounded-xl transition-all flex items-center justify-center gap-2 btn-interactive';

  const variantStyles = {
    primary: 'bg-primary-600 hover:bg-primary-700 text-white shadow-lg',
    secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-lg',
  };

  const sizeStyles = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-3',
    lg: 'px-6 py-4 text-lg',
  };

  const disabledStyles = isDisabled ? 'opacity-50 cursor-not-allowed' : '';

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={clsx(
        baseStyles,
        variantStyles[variant],
        sizeStyles[size],
        disabledStyles,
        className,
      )}
      aria-busy={loading}
      {...props}
    >
      {loading ? (
        <>
          <div
            className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full"
            aria-hidden="true"
          />
          {loadingText || children}
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
}
