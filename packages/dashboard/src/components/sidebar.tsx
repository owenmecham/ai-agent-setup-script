'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Home', icon: '⌂' },
  { href: '/chat', label: 'Chat', icon: '💬' },
  { href: '/knowledge', label: 'Knowledge', icon: '📚' },
  { href: '/memory', label: 'Memory', icon: '🧠' },
  { href: '/scheduler', label: 'Scheduler', icon: '⏰' },
  { href: '/integrations', label: 'Integrations', icon: '🔌' },
  { href: '/audit', label: 'Audit Log', icon: '📋' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col">
      <div className="p-6 border-b border-zinc-800">
        <h1 className="text-xl font-bold text-white">Murph</h1>
        <p className="text-xs text-zinc-500 mt-1">AI Agent Dashboard</p>
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
