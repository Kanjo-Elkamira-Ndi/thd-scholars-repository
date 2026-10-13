import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { AccessDenied } from '@/components/shared/AccessDenied';
import { CardSkeleton } from '@/components/shared/LoadingSkeletons';
import { PageTransition } from '@/components/shared/PageTransition';
import { useContentPost, useCreateContent, useUpdateContent, useUploadContent } from '@/hooks/use-content';
import { useMe } from '@/hooks/use-me';
import { ApiError } from '@/lib/api';
import { setClosingConfirmation } from '@/lib/telegram-actions';
import { ContentForm, type ContentFormValues } from './components/ContentForm';

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'NETWORK_ERROR') {
      return 'Upload interrupted — check the Content list before retrying.';
    }
    if (
      error.code === 'VALIDATION_ERROR' ||
      error.status === 400 ||
      error.status === 413 ||
      error.status === 415
    ) {
      return error.message;
    }
  }
  return 'Could not save this post. Please try again.';
}

export default function ContentComposerScreen() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const post = useContentPost(id);
  const me = useMe();
  const create = useCreateContent();
  const update = useUpdateContent();
  const upload = useUploadContent();

  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      setClosingConfirmation(false);
    },
    [],
  );

  const isOwner = Boolean(post.data) && me.data?.user.id === post.data?.postedBy;
  if (isEdit && post.data && me.data && me.data.user.role !== 'admin' && !isOwner) {
    return (
      <AccessDenied
        title="You cannot edit this post"
        description="Only the person who published it or an admin can make changes."
      />
    );
  }

  const handleSuccess = () => navigate('/content');

  const handleSubmit = (values: ContentFormValues) => {
    setError(null);

    if (isEdit && id) {
      update.mutate(
        {
          id,
          patch: {
            title: values.title,
            disciplineTag: values.disciplineTag,
            formatTag: values.formatTag,
            cohortYear: values.cohortYear,
          },
        },
        { onSuccess: handleSuccess, onError: (e) => setError(messageFor(e)) },
      );
      return;
    }

    if (values.file) {
      const controller = new AbortController();
      abortRef.current = controller;
      setProgress(0);
      setClosingConfirmation(true);
      upload.mutate(
        {
          fields: {
            title: values.title,
            disciplineTag: values.disciplineTag,
            formatTag: values.formatTag,
            cohortYear: values.cohortYear,
          },
          file: values.file,
          onProgress: setProgress,
          signal: controller.signal,
        },
        {
          onSuccess: () => {
            setClosingConfirmation(false);
            setProgress(null);
            handleSuccess();
          },
          onError: (e) => {
            setClosingConfirmation(false);
            setProgress(null);
            setError(messageFor(e));
          },
        },
      );
      return;
    }

    create.mutate(
      {
        title: values.title,
        disciplineTag: values.disciplineTag,
        formatTag: values.formatTag,
        cohortYear: values.cohortYear,
        driveLink: values.driveLink,
      },
      { onSuccess: handleSuccess, onError: (e) => setError(messageFor(e)) },
    );
  };

  if (isEdit && post.isLoading) {
    return (
      <PageTransition className="space-y-4">
        <CardSkeleton />
      </PageTransition>
    );
  }

  return (
    <PageTransition className="space-y-4">
      <h1 className="text-lg font-semibold">{isEdit ? 'Edit post' : 'New post'}</h1>
      <ContentForm
        mode={isEdit ? 'edit' : 'create'}
        initial={post.data}
        onSubmit={handleSubmit}
        busy={create.isPending || update.isPending || upload.isPending}
        progress={progress}
        onCancelUpload={() => abortRef.current?.abort()}
        errorMessage={error}
      />
    </PageTransition>
  );
}
