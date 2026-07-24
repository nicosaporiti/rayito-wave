type RayitoMarkProps = {
  readonly className?: string;
  readonly tone?: 'brand' | 'monochrome';
};

export function RayitoMark({
  className = '',
  tone = 'brand',
}: RayitoMarkProps) {
  const classes = ['rayito-mark', `rayito-mark--${tone}`, className]
    .filter(Boolean)
    .join(' ');

  return <img className={classes} src="/rayito-logo.png" alt="" aria-hidden="true" />;
}
