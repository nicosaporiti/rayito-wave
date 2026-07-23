import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronRight,
  Copy,
  House,
  Link2,
  ReceiptText,
  Zap,
  type LucideProps,
} from 'lucide-react';

type IconProps = Readonly<LucideProps>;

export function BoltIcon(props: IconProps) {
  return <Zap aria-hidden="true" {...props} />;
}

export function ArrowUpIcon(props: IconProps) {
  return <ArrowUp aria-hidden="true" {...props} />;
}

export function ArrowDownIcon(props: IconProps) {
  return <ArrowDown aria-hidden="true" {...props} />;
}

export function LinkIcon(props: IconProps) {
  return <Link2 aria-hidden="true" {...props} />;
}

export function CopyIcon(props: IconProps) {
  return <Copy aria-hidden="true" {...props} />;
}

export function CheckIcon(props: IconProps) {
  return <Check aria-hidden="true" {...props} />;
}

export function ChevronRightIcon(props: IconProps) {
  return <ChevronRight aria-hidden="true" {...props} />;
}

export function ArrowLeftIcon(props: IconProps) {
  return <ArrowLeft aria-hidden="true" {...props} />;
}

export function HomeIcon(props: IconProps) {
  return <House aria-hidden="true" {...props} />;
}

export function ActivityIcon(props: IconProps) {
  return <ReceiptText aria-hidden="true" {...props} />;
}
