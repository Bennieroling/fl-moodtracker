'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Calendar,
  BarChart3,
  User,
  Settings,
  LogOut,
  Apple,
  Dumbbell,
  HeartPulse,
  Sparkles,
  UtensilsCrossed,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { BottomNav } from '@/components/bottom-nav'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Apple },
  { name: 'Exercise', href: '/exercise', icon: Dumbbell },
  { name: 'Health', href: '/health', icon: HeartPulse },
  { name: 'Calendar', href: '/calendar', icon: Calendar },
  { name: 'Insights', href: '/insights', icon: Sparkles },
  { name: 'Charts', href: '/charts', icon: BarChart3 },
  { name: 'Profile', href: '/profile', icon: User },
]

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading, error, signOut } = useAuth()
  const hasRedirected = useRef(false)

  useEffect(() => {
    if (!loading && !user && !hasRedirected.current) {
      hasRedirected.current = true
      router.replace('/login')
    } else if (user) {
      hasRedirected.current = false
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden />
        <div className="text-center">
          <p className="font-medium">Loading your dashboard...</p>
          {error && <p className="text-sm text-muted-foreground">{error.message}</p>}
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden />
        <div className="text-center">
          <p className="font-medium">{error ? 'Session expired' : 'Redirecting...'}</p>
          <p className="text-sm text-muted-foreground">
            {error ? 'Please sign in again.' : 'Taking you to the login screen.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto max-w-6xl flex h-14 items-center">
          <div className="mr-4 flex">
            <Link href="/dashboard" className="mr-6 flex items-center space-x-2">
              <UtensilsCrossed className="h-5 w-5 text-primary" />
              <span className="font-bold">Pulse</span>
            </Link>
          </div>

          {/* Navigation — desktop only */}
          <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
            {navigation.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'transition-colors hover:text-foreground/80 flex items-center space-x-2',
                    isActive ? 'text-foreground' : 'text-foreground/60',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden md:inline">{item.name}</span>
                </Link>
              )
            })}
          </nav>

          {/* User Menu */}
          <div className="flex flex-1 items-center justify-end space-x-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{user.email?.charAt(0).toUpperCase() || 'U'}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">Account</p>
                    <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto max-w-6xl py-6 pb-24 md:pb-6">{children}</main>

      <BottomNav />
    </div>
  )
}
