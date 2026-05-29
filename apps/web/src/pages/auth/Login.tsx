import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { LoginRequest } from '@intelligencehub/shared';
import { useLoginMutation } from '../../store/api';
import { isMutationErrorMessage } from '../../lib/auth';
import { useRedirectIfAuthed } from '../../components/auth/useRedirectIfAuthed';
import {
  AuthAltAction,
  AuthErrorBanner,
  AuthField,
  AuthFormShell,
  AuthSubmitButton,
} from '../../components/auth/AuthForm';

export default function Login() {
  const navigate = useNavigate();
  const [loginUser, { isLoading, error }] = useLoginMutation();
  useRedirectIfAuthed();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<typeof LoginRequest._type>({
    resolver: zodResolver(LoginRequest),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: typeof LoginRequest._type) {
    try {
      const result = await loginUser(values).unwrap();
      if (result.user.emailConfirmed) navigate('/dashboard', { replace: true });
      else navigate('/auth/check-email', { replace: true });
    } catch {
      // shown via `error` state below
    }
  }

  return (
    <AuthFormShell eyebrow="Sign in" title="Welcome back" onSubmit={handleSubmit(onSubmit)}>
      <AuthField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        autoFocus
        registration={register('email')}
        error={errors.email}
      />
      <AuthField
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        registration={register('password')}
        error={errors.password}
        className="mb-4 block"
      />
      <AuthErrorBanner message={error ? isMutationErrorMessage(error) : null} />
      <AuthSubmitButton isLoading={isLoading} idle="sign in" loading="signing in…" />
      <AuthAltAction prompt="No account?" to="/auth/register" label="Create one →" />
    </AuthFormShell>
  );
}
