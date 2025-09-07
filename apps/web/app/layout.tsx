import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/lib/auth-context"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "sonner"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Food & Mood",
  description: "Track your wellness journey with AI-powered insights and personalized recommendations.",
  keywords: ["wellness", "mood tracking", "food diary", "AI insights", "health"],
  authors: [{ name: "Sofi Team" }],
  creator: "Festina Lente",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    title: "Food & Mood",
    description: "Track your wellness journey with AI-powered insights and personalized recommendations.",
    siteName: "Food & Mood",
  },
  twitter: {
    card: "summary_large_image",
    title: "Food & Mood",
    description: "Track your wellness journey with AI-powered insights and personalized recommendations.",
  },
  icons: {
    icon: "/favicon.ico",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            {children}
            <Toaster richColors position="top-right" />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
