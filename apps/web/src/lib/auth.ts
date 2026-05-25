import type { FieldError } from 'react-hook-form';

export function errorMessage(error: FieldError | undefined): string | null {
  if (!error) return null;
  if (error.message) return error.message;
  switch (error.type) {
    case 'required':
      return 'Required';
    case 'min':
      return 'Too short';
    case 'max':
      return 'Too long';
    default:
      return 'Invalid value';
  }
}

export function isMutationErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  if ('data' in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'message' in data) {
      const msg = (data as { message?: unknown }).message;
      if (typeof msg === 'string') return msg;
    }
  }
  return 'Something went wrong';
}
