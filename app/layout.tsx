import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { FilterProvider } from '@/lib/filter-context'
import { QueryProvider } from '@/components/query-provider'
import { ServiceWorkerRegister } from '@/components/service-worker-register'

export const metadata: Metadata = {
  title: 'Food & Mood',
  description:
    'Track your wellness journey with AI-powered insights and personalized recommendations.',
  keywords: ['wellness', 'mood tracking', 'food diary', 'AI insights', 'health'],
  authors: [{ name: 'Pulse Team' }],
  creator: 'Festina Lente',
  manifest: '/manifest.json',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Pulse',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  metadataBase: new URL(
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000',
  ),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000',
    title: 'Food & Mood',
    description:
      'Track your wellness journey with AI-powered insights and personalized recommendations.',
    siteName: 'Food & Mood',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Food & Mood',
    description:
      'Track your wellness journey with AI-powered insights and personalized recommendations.',
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/icon-192x192.png',
  },
}

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
  weight: ['400', '500', '600', '700'],
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} antialiased`}>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <AuthProvider>
              <FilterProvider>
                {children}
                <Toaster />
              </FilterProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
