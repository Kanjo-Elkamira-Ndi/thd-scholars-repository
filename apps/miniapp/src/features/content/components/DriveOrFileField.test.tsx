import { renderWithProviders } from '@/test/render';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DriveOrFileField } from './DriveOrFileField';

function Harness() {
  const [file, setFile] = useState<File | null>(null);
  const [driveLink, setDriveLink] = useState('');
  return (
    <DriveOrFileField
      formatTag="audio_lecture"
      file={file}
      onFileChange={setFile}
      driveLink={driveLink}
      onDriveLinkChange={setDriveLink}
      error={file || driveLink ? undefined : 'Pick one source'}
    />
  );
}

describe('DriveOrFileField', () => {
  it('shows the file input by default and swaps to the Drive link input', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    expect(screen.getByLabelText(/upload audio_lecture file/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /drive link/i }));

    expect(await screen.findByLabelText(/drive link/i)).toBeInTheDocument();
  });

  it('renders the inline error', () => {
    renderWithProviders(<Harness />);

    expect(screen.getByRole('alert')).toHaveTextContent('Pick one source');
  });

  it('surfaces the selected file name', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    const input = screen.getByLabelText(/upload audio_lecture file/i);
    await user.upload(input, new File([new Uint8Array(1)], 'lecture.mp3', { type: 'audio/mpeg' }));

    expect(await screen.findByText(/selected: lecture.mp3/i)).toBeInTheDocument();
  });

  it('calls onDriveLinkChange as text is typed', async () => {
    const onDriveLinkChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <DriveOrFileField
        formatTag="audio_lecture"
        file={null}
        onFileChange={vi.fn()}
        driveLink=""
        onDriveLinkChange={onDriveLinkChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: /drive link/i }));
    await user.type(screen.getByLabelText(/drive link/i), 'h');

    expect(onDriveLinkChange).toHaveBeenCalled();
  });
});
