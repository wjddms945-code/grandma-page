import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '업무 노트',
  description: '떠오르는 업무 메모를 빠르게 쌓고, 필요할 때만 정리하는 개인 업무 노트',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
