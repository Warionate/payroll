import Skeleton from './Skeleton';

interface Props {
  count?: number;
  className?: string;
  height?: string;
}

export default function SkeletonRow({ count = 3, className = '', height = 'h-12' }: Props) {
  return (
    <div className={`space-y-3 ${className}`}>
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          className={`w-full ${height} bg-gray-100 rounded-lg animate-pulse flex items-center px-4 gap-4`}
        >
          <Skeleton className="w-8 h-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="w-1/3 h-3" />
            <Skeleton className="w-1/2 h-2" />
          </div>
        </div>
      ))}
    </div>
  );
}
