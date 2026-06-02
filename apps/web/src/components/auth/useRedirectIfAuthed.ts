import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetMeQuery } from '../../store/api';

/** Redirect away from the auth pages when the user is already signed in:
 * confirmed → /articles, unconfirmed → /auth/check-email. Shared by Login and
 * Register, which both bounce an authenticated visitor. */
export function useRedirectIfAuthed(): void {
  const { data: me } = useGetMeQuery();
  const navigate = useNavigate();
  useEffect(() => {
    if (me?.emailConfirmed) void navigate('/articles', { replace: true });
    else if (me) void navigate('/auth/check-email', { replace: true });
  }, [me, navigate]);
}
