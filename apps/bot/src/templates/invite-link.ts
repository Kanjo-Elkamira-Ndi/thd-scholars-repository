export const renderInviteLink = ({
  name,
  link,
  expiresInHours,
}: {
  name: string;
  link: string;
  expiresInHours: number;
}): string =>
  [
    `✅ Welcome, ${name}!`,
    '',
    'Your registration was approved. Tap the link below to join the Th.D. Scholars channel:',
    '',
    link,
    '',
    `This link works once and expires in ${expiresInHours} hours. If it expires before you use it, run /mystatus or contact the Registrar.`,
  ].join('\n');
