type SecurityMarkProps = {
  readonly className?: string;
};

export function SecurityMark({ className = '' }: SecurityMarkProps) {
  const classes = ['security-mark', className].filter(Boolean).join(' ');
  return <img className={classes} src="/security-mark.svg" alt="" aria-hidden="true" />;
}
