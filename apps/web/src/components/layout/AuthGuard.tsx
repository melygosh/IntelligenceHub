import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useGetMeQuery } from '../../store/api';

type Props = { children: ReactNode };

export default function AuthGuard({ children }: Props) {
  const { data, isLoading, isError, error } = useGetMeQuery();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-500">
        Loading…
      </div>
    );
  }

  const status = isError && typeof error === 'object' && error && 'status' in error
    ? (error as { status?: number }).status
    : undefined;

  if (!data || status === 401) {
    return <Navigate to="/auth/login" replace />;
  }

  return <>{children}</>;
}
