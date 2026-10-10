export const renderApproval = ({ name }: { name: string }): string =>
  [
    `✅ Welcome, ${name}!`,
    '',
    "Your registration was approved and you've been added to the Th.D. community channel. You now have access to all cohort materials.",
    '',
    'Open the Mini App anytime to browse content and check your status.',
  ].join('\n');
