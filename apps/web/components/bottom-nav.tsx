'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Activity, HeartPulse, Calendar, BarChart3, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { name: 'Home', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Exercise', href: '/exercise', icon: Activity },
  { name: 'Health', href: '/health', icon: HeartPulse },
  { name: 'Calendar', href: '/calendar', icon: Calendar },
  { name: 'Insights', href: '/insights', icon: BarChart3 },
  { name: 'Profile', href: '/profile', icon: User },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-sm md:hidden">
      <div className="flex h-16 items-center justify-around pb-safe">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-2 text-[10px] font-medium transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{tab.name}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
