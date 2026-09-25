import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';

import { ApiError } from '../../shared/api/http-client';
import type { Role } from '../../shared/tab/types';
import { Banner } from '../../shared/ui/Banner';
import { Button } from '../../shared/ui/Button';
import { TextInput } from '../../shared/ui/TextInput';
import { useLoginMutation } from './api';
import { loginSchema, type LoginFormValues } from './schemas';

interface LoginFormProps {
  role: Role;
  initialEmail?: string;
}

export function LoginForm({ role, initialEmail }: LoginFormProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { mutate, isPending } = useLoginMutation(role);

  const { register, handleSubmit } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: initialEmail ?? '', password: '' },
  });

  const onValid = (values: LoginFormValues) => {
    setErrorMessage(null);
    mutate(values, {
      onError: (error) => {
        if (error instanceof ApiError) {
          setErrorMessage(error.status === 401 ? 'Email or password is incorrect.' : error.message);
          return;
        }
        setErrorMessage('Unable to sign in.');
      },
    });
  };

  // Validation errors surface as a single banner on submit, like the apps.
  const onInvalid = (errors: FieldErrors<LoginFormValues>) => {
    const firstError = Object.values(errors)[0]?.message;
    setErrorMessage(typeof firstError === 'string' ? firstError : 'Please check the form and try again.');
  };

  return (
    <form onSubmit={handleSubmit(onValid, onInvalid)} noValidate>
      {errorMessage && <Banner message={errorMessage} variant="error" onDismiss={() => setErrorMessage(null)} />}

      <TextInput label="Email" type="email" autoComplete="username" {...register('email')} />
      <TextInput
        label="Password"
        type="password"
        autoComplete="current-password"
        revealToggle
        {...register('password')}
      />

      <Button label="Sign in" type="submit" size="large" loading={isPending} />
    </form>
  );
}
