'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoginData } from '@/lib/validations'

export default function LoginPage() {
  const router = useRouter()
  const { signIn, signInWithGoogle, signInDemo, isDemoMode } = useAuth()
  const [formData, setFormData] = useState<LoginData>({
    email: '',
    password: '',
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await signIn(formData)
      if (!result.error) {
        router.push('/dashboard')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDemoLogin = async () => {
    setLoading(true)
    try {
      await signInDemo()
      router.push('/dashboard')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-500 to-blue-600 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <span className="text-4xl">🍎</span>
          </div>
          <CardTitle className="text-center">Welcome back to Sofi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isDemoMode && (
            <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🚀</span>
                <h3 className="font-semibold text-blue-900 dark:text-blue-100">Demo Mode Available</h3>
              </div>
              <p className="text-sm text-blue-700 dark:text-blue-200 mb-3">
                No Supabase setup required! Try the full app experience with demo data.
              </p>
              <Button 
                onClick={handleDemoLogin}
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={loading}
              >
                🎯 Explore Demo
              </Button>
            </div>
          )}
          <div className={isDemoMode ? "border-t pt-4" : ""}>
            <h4 className="text-sm font-medium mb-2 text-center text-muted-foreground">
              {isDemoMode ? "Or sign in with real credentials:" : "Sign in to your account:"}
            </h4>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              Sign in
            </Button>
          </form>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => signInWithGoogle()}
          >
            Continue with Google
          </Button>
          <p className="text-center text-sm">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-primary hover:underline">
              Sign up
            </Link>
          </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}