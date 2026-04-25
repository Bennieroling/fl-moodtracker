'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { WifiOff, RefreshCw, Cloud, Smartphone } from 'lucide-react'

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    const updateOnlineStatus = () => {
      setIsOnline(navigator.onLine)
    }

    // Set initial status
    updateOnlineStatus()

    // Listen for online/offline events
    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)

    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [])

  const handleRetry = () => {
    if (navigator.onLine) {
      // Try to navigate back or reload
      if (window.history.length > 1) {
        window.history.back()
      } else {
        window.location.href = '/dashboard'
      }
    } else {
      window.location.reload()
    }
  }

  const handleGoHome = () => {
    window.location.href = '/dashboard'
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        {/* Offline Icon */}
        <div className="text-center">
          <WifiOff className="h-24 w-24 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-3xl font-bold mb-2">You&apos;re Offline</h1>
          <p className="text-muted-foreground">
            It looks like you&apos;ve lost your internet connection.
          </p>
        </div>

        {/* Status Alert */}
        {isOnline ? (
          <Alert>
            <Cloud className="h-4 w-4" />
            <AlertDescription>
              Your connection has been restored! You can now retry.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <WifiOff className="h-4 w-4" />
            <AlertDescription>
              No internet connection detected. Please check your network settings.
            </AlertDescription>
          </Alert>
        )}

        {/* Offline Features */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Available Offline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm space-y-2">
              <p>✅ View previously loaded pages</p>
              <p>✅ Browse cached content</p>
              <p>✅ Access your profile settings</p>
              <p>⏳ New entries will sync when online</p>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button 
            onClick={handleRetry} 
            className="w-full"
            variant={isOnline ? "default" : "outline"}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {isOnline ? 'Connection Restored - Continue' : 'Try Again'}
          </Button>
          
          <Button 
            onClick={handleGoHome} 
            variant="outline" 
            className="w-full"
          >
            Go to Dashboard
          </Button>
        </div>

        {/* Tips */}
        <Card className="bg-muted">
          <CardContent className="pt-6">
            <h3 className="font-medium mb-3">Troubleshooting Tips:</h3>
            <ul className="text-sm space-y-2 text-muted-foreground">
              <li>• Check your WiFi or mobile data connection</li>
              <li>• Try moving to an area with better signal</li>
              <li>• Restart your router or toggle airplane mode</li>
              <li>• Some features will work offline with cached data</li>
            </ul>
          </CardContent>
        </Card>

        {/* PWA Install Hint */}
        <div className="text-center text-sm text-muted-foreground">
          <p>
            💡 Install this app on your device for better offline experience
          </p>
        </div>
      </div>
    </div>
  )
}