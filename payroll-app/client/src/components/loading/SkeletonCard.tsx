import Skeleton from './Skeleton';

interface Props {
  count?: number;
  className?: string;
}

export default function SkeletonCard({ count = 1, className = '' }: Props) {
  return (
    <div className={`${className}`}>
      {[...Array(count)].map((_, i) => (
        <div key={i} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-3">
          <div className="flex justify-between items-center">
            <Skeleton className="w-1/3 h-4" />
            <Skeleton className="w-5 h-5 rounded-full" />
          </div>
          <Skeleton className="w-full h-8" />
          <Skeleton className="w-2/3 h-3" />
        </div>
      ))}
    </div>
  );
}
