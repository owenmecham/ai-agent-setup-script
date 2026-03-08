'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import murphLogo from '../app/murph.jpg';

const navItems = [
  { href: '/', label: 'Home', icon: '⌂' },
  { href: '/profile', label: 'Profile', icon: '👤' },
  { href: '/chat', label: 'Chat', icon: '💬' },
  { href: '/approvals', label: 'Approvals', icon: '✅' },
  { href: '/knowledge', label: 'Knowledge', icon: '📚' },
  { href: '/memory', label: 'Memory', icon: '🧠' },
  { href: '/scheduler', label: 'Scheduler', icon: '⏰' },
  { href: '/integrations', label: 'Integrations', icon: '🔌' },
  { href: '/audit', label: 'Audit Log', icon: '📋' },
  { href: '/secrets', label: 'Secrets', icon: '🔐' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

interface SidebarConfig {
  agent: { name: string };
}

export function Sidebar() {
  const pathname = usePathname();

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const res = await fetch('/api/config');
      return res.json() as Promise<SidebarConfig>;
    },
  });

  const { data: avatarStatus } = useQuery({
    queryKey: ['avatar'],
    queryFn: async () => {
      const res = await fetch('/api/avatar');
      return res.json() as Promise<{ hasCustom: boolean; timestamp?: number }>;
    },
  });

  const agentName = config?.agent?.name ?? 'Murph';
  const hasCustomAvatar = avatarStatus?.hasCustom ?? false;
  const avatarTimestamp = avatarStatus?.timestamp ?? 0;

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col">
      <div className="p-4 border-b border-zinc-800">
        {hasCustomAvatar ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`/api/avatar/image?t=${avatarTimestamp}`}
            alt={agentName}
            className="w-full h-auto rounded-lg"
          />
        ) : (
          <Image
            src={murphLogo}
            alt={agentName}
            className="w-full h-auto rounded-lg"
            priority
          />
        )}
        <p className="text-center text-sm font-medium text-zinc-300 mt-2">{agentName}</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs text-zinc-500">System Online</span>
        </div>
      </div>
    </aside>
  );
}
