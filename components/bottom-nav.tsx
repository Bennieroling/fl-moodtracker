'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, HeartPulse, LayoutDashboard, Plus, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Tab {
  name: string
  href: string
  icon: typeof LayoutDashboard
}

const tabs: Tab[] = [
  { name: 'Home', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Exercise', href: '/exercise', icon: Activity },
  { name: 'Health', href: '/health', icon: HeartPulse },
  { name: 'Insights', href: '/insights', icon: Sparkles },
]

export function BottomNav() {
  const pathname = usePathname()
  const isLogActive = pathname === '/log'

  return (
    <nav
      aria-label="Primary"
      className="fixed right-0 bottom-0 left-0 z-50 border-t bg-background/95 backdrop-blur-sm md:hidden"
    >
      <div className="pb-safe relative grid h-16 grid-cols-5 items-center">
        {/* First two tabs */}
        {tabs.slice(0, 2).map((tab) => (
          <TabLink key={tab.href} tab={tab} active={pathname === tab.href} />
        ))}

        {/* Center raised Log button */}
        <Link
          href="/log"
          aria-current={isLogActive ? 'page' : undefined}
          aria-label="Log"
          className={cn(
            'mx-auto -mt-6 flex h-12 w-12 items-center justify-center rounded-full',
            'bg-primary text-primary-foreground shadow-card-lg ring-2 ring-background',
            'transition-transform hover:scale-105 active:scale-95',
            'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
          )}
        >
          <Plus className="h-5 w-5" aria-hidden />
          <span className="sr-only">Log</span>
        </Link>

        {/* Last two tabs */}
        {tabs.slice(2).map((tab) => (
          <TabLink key={tab.href} tab={tab} active={pathname === tab.href} />
        ))}
      </div>
    </nav>
  )
}

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = tab.icon
  return (
    <Link
      href={tab.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-5 w-5" aria-hidden />
      <span>{tab.name}</span>
    </Link>
  )
}
