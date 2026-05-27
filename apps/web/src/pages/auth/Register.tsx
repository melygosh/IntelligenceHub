import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { RegisterRequest } from '@intelligencehub/shared';
import { useRegisterMutation } from '../../store/api';
import { isMutationErrorMessage } from '../../lib/auth';
import { useRedirectIfAuthed } from '../../components/auth/useRedirectIfAuthed';
import {
  AuthAltAction,
  AuthErrorBanner,
  AuthField,
  AuthFormShell,
  AuthSubmitButton,
} from '../../components/auth/AuthForm';

export default function Register() {
  const navigate = useNavigate();
  const [registerUser, { isLoading, error }] = useRegisterMutation();
  useRedirectIfAuthed();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<typeof RegisterRequest._input, unknown, typeof RegisterRequest._type>({
    resolver: zodResolver(RegisterRequest),
    defaultValues: { email: '', password: '', loadDemoData: false },
  });

  async function onSubmit(values: typeof RegisterRequest._type) {
    try {
      const result = await registerUser(values).unwrap();
      if (result.devModeConfirmLink) {
        sessionStorage.setItem('devModeConfirmLink', result.devModeConfirmLink);
      }
      navigate('/auth/check-email', {
        replace: true,
        state: { devModeConfirmLink: result.devModeConfirmLink },
      });
    } catch {
      // shown via `error` state below
    }
  }

  return (
    <AuthFormShell eyebrow="Create account" title="Make your hub." onSubmit={handleSubmit(onSubmit)}>
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
        autoComplete="new-password"
        registration={register('password')}
        error={errors.password}
        hint="Minimum 8 characters."
        className="mb-4 block"
      />
      <AuthErrorBanner message={error ? isMutationErrorMessage(error) : null} />

      <label className="mb-4 flex items-start gap-2 group" htmlFor="loadDemoData">
        <input
          id="loadDemoData"
          type="checkbox"
          className="mt-0.5 h-3.5 w-3.5 cursor-pointer border-border accent-accent"
          {...register('loadDemoData')}
        />
        <span className="flex items-center gap-1.5 font-mono text-[13px] text-ink">
          Load demo data
          <span
            role="tooltip"
            aria-label="What does this do?"
            tabIndex={0}
            onClick={(e) => e.preventDefault()}
            className="relative inline-flex h-4 w-4 cursor-help items-center justify-center border border-mute2 text-[11px] text-mute2 hover:text-ink focus:text-ink focus:outline-none"
          >
            ?
            <span className="invisible absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 border border-border bg-paper px-2 py-1.5 text-left font-mono text-[12px] leading-relaxed text-muted opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
              Loads ~20 sample HN articles with pre-generated tags so you can
              explore the graph without waiting for live RSS pulls.
            </span>
          </span>
        </span>
      </label>

      <AuthSubmitButton isLoading={isLoading} idle="create account" loading="creating…" />
      <AuthAltAction prompt="Have an account?" to="/auth/login" label="Sign in →" />
    </AuthFormShell>
  );
}
