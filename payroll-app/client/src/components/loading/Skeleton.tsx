interface Props {
  className?: string;
}

export default function Skeleton({ className = '' }: Props) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`}></div>;
}
