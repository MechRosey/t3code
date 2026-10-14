export interface BoardColumnMoreProps {
  readonly status: string;
  readonly mountedCount: number;
  readonly hiddenCount: number;
  readonly onReveal: (status: string, mountedCount: number) => void;
}

export function BoardColumnMore(_props: BoardColumnMoreProps) {
  return null;
}
