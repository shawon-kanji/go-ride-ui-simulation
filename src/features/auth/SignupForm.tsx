import { zodResolver } from '@hookform/resolvers/zod';
import { Info } from 'lucide-react';
import { useState } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { useNavigate } from 'react-router';

import { ApiError } from '../../shared/api/http-client';
import { ROLE_BASE } from '../../shared/tab/routes';
import type { Role } from '../../shared/tab/types';
import { Banner } from '../../shared/ui/Banner';
import { Button } from '../../shared/ui/Button';
import { TextInput } from '../../shared/ui/TextInput';
import { SignupSucceededLoginFailedError, useSignupMutation } from './api';
import { signupSchema, type SignupFormValues } from './schemas';

// Driver copy from go-ride-driver-app's SignupForm. The rider app's signup has no note.
const NOTE: Record<Role, string | null> = {
  driver:
    "That's all we need to open your account. Add a vehicle and upload documents later, from the menu — you'll need both approved before your first trip.",
  rider: null,
};

interface SignupFormProps {
  role: Role;
}

export function SignupForm({ role }: SignupFormProps) {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { mutate, isPending } = useSignupMutation(role);

  const { register, handleSubmit, formState } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: '', password: '', first_name: '', last_name: '' },
  });

  const onValid = (values: SignupFormValues) => {
    setErrorMessage(null);
    mutate(values, {
      onError: (error) => {
        if (error instanceof SignupSucceededLoginFailedError) {
          navigate(`${ROLE_BASE[role]}/login?email=${encodeURIComponent(error.email)}`, {
            replace: true,
          });
          return;
        }
        setErrorMessage(error instanceof ApiError ? error.message : 'Unable to sign up.');
      },
    });
  };

  const onInvalid = (errors: FieldErrors<SignupFormValues>) => {
    const firstError = Object.values(errors)[0]?.message;
    setErrorMessage(typeof firstError === 'string' ? firstError : 'Please check the form and try again.');
  };

  return (
    <form onSubmit={handleSubmit(onValid, onInvalid)} noValidate>
      {errorMessage && <Banner message={errorMessage} variant="error" onDismiss={() => setErrorMessage(null)} />}

      <div className="flex gap-3">
        <TextInput label="First name" autoComplete="given-name" className="flex-1" {...register('first_name')} />
        <TextInput label="Last name" autoComplete="family-name" className="flex-1" {...register('last_name')} />
      </div>
      <TextInput label="Email" type="email" autoComplete="username" {...register('email')} />
      <TextInput
        label="Password"
        type="password"
        autoComplete="new-password"
        revealToggle
        errorText={formState.errors.password ? 'Use at least 8 characters.' : undefined}
        {...register('password')}
      />

      {NOTE[role] && (
        <div className="mb-4 flex items-start gap-3 rounded-control bg-primary-50 px-3 py-3 text-primary-700">
          <Info size={18} strokeWidth={2} className="mt-px shrink-0 text-primary-600" />
          <p className="flex-1 text-[13px] font-semibold">{NOTE[role]}</p>
        </div>
      )}

      <Button label="Continue" type="submit" size="large" loading={isPending} />
    </form>
  );
}
