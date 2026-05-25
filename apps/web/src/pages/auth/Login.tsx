import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { LoginRequest } from '@intelligencehub/shared';
import { useGetMeQuery, useLoginMutation } from '../../store/api';
import { errorMessage, isMutationErrorMessage } from '../../lib/auth';

export default function Login() {
  const { data: me } = useGetMeQuery();
  const navigate = useNavigate();
  const [loginUser, { isLoading, error }] = useLoginMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<typeof LoginRequest._type>({
    resolver: zodResolver(LoginRequest),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (me) navigate('/articles', { replace: true });
  }, [me, navigate]);

  async function onSubmit(values: typeof LoginRequest._type) {
    try {
      await loginUser(values).unwrap();
      navigate('/articles', { replace: true });
    } catch {
      // shown via `error` state below
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm space-y-4 rounded border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-lg font-semibold">Sign in</h1>

        <div className="space-y-1">
          <label className="block text-sm text-gray-700" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            {...register('email')}
          />
          {errorMessage(errors.email) ? (
            <p className="text-xs text-red-600">{errorMessage(errors.email)}</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label className="block text-sm text-gray-700" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            {...register('password')}
          />
          {errorMessage(errors.password) ? (
            <p className="text-xs text-red-600">{errorMessage(errors.password)}</p>
          ) : null}
        </div>

        {error ? <p className="text-sm text-red-600">{isMutationErrorMessage(error)}</p> : null}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isLoading ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-center text-xs text-gray-500">
          No account?{' '}
          <Link className="underline" to="/auth/register">
            Create one
          </Link>
        </p>
      </form>
    </div>
  );
}
