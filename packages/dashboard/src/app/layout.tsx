import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Sidebar } from '../components/sidebar';

export const metadata: Metadata = {
  title: 'Murph Dashboard',
  description: 'Murph AI Agent Control Panel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen">
        <Providers>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 p-6 ml-64">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
