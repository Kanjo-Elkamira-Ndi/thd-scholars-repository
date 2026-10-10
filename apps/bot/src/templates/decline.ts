export const renderDecline = ({ reason }: { reason: string }): string =>
  [
    "❌ We couldn't verify your registration.",
    '',
    `Reason: ${reason}`,
    '',
    "This usually means your DIBI Registration ID wasn't found on the Registrar's roster, or your record isn't active. Please double-check your details and try again, or contact the Registrar if you believe this is an error.",
  ].join('\n');
