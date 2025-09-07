'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  User, 
  Settings, 
  Download, 
  Trash2, 
  Bell, 
  Moon, 
  Sun, 
  Eye, 
  EyeOff,
  LogOut,
  BarChart3
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'

interface UserPreferences {
  units: 'metric' | 'imperial'
  reminderEnabled: boolean
  reminderTime: string
  journalModeDefault: boolean
  notificationsEnabled: boolean
}

interface UserStats {
  totalEntries: number
  longestStreak: number
  currentStreak: number
  joinDate: string
  totalDays: number
}

export default function ProfilePage() {
  const { user, signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  
  const [preferences, setPreferences] = useState<UserPreferences>({
    units: 'metric',
    reminderEnabled: true,
    reminderTime: '09:00',
    journalModeDefault: false,
    notificationsEnabled: true,
  })
  
  const [userStats, setUserStats] = useState<UserStats>({
    totalEntries: 0,
    longestStreak: 0,
    currentStreak: 0,
    joinDate: '',
    totalDays: 0,
  })
  
  const [displayName, setDisplayName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Load user data and preferences
  useEffect(() => {
    if (user) {
      // Set display name from user metadata or email
      setDisplayName(user.user_metadata?.full_name || user.email?.split('@')[0] || '')
      
      // Load user preferences (mock data - replace with actual Supabase queries)
      setPreferences({
        units: 'metric',
        reminderEnabled: true,
        reminderTime: '09:00',
        journalModeDefault: false,
        notificationsEnabled: true,
      })
      
      // Load user stats (mock data - replace with actual Supabase queries)
      setUserStats({
        totalEntries: 145,
        longestStreak: 28,
        currentStreak: 7,
        joinDate: '2024-01-15',
        totalDays: 45,
      })
    }
  }, [user])

  const handleSaveProfile = async () => {
    setIsLoading(true)
    try {
      // TODO: Update user profile in Supabase
      console.log('Saving profile:', { displayName })
      toast.success('Profile updated successfully!')
    } catch (error) {
      toast.error('Failed to update profile')
      console.error('Profile update error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSavePreferences = async () => {
    setIsLoading(true)
    try {
      // TODO: Update user preferences in Supabase
      console.log('Saving preferences:', preferences)
      toast.success('Preferences updated successfully!')
    } catch (error) {
      toast.error('Failed to update preferences')
      console.error('Preferences update error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportData = async () => {
    setIsLoading(true)
    try {
      // TODO: Generate and download user data export
      console.log('Exporting user data...')
      
      // Simulate export process
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      toast.success('Data export will be sent to your email!')
    } catch (error) {
      toast.error('Failed to export data')
      console.error('Export error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true)
      return
    }
    
    setIsLoading(true)
    try {
      // TODO: Delete user account and all data
      console.log('Deleting account...')
      toast.success('Account deletion initiated. You will be logged out.')
      await signOut()
    } catch (error) {
      toast.error('Failed to delete account')
      console.error('Account deletion error:', error)
    } finally {
      setIsLoading(false)
      setShowDeleteConfirm(false)
    }
  }

  const getUserInitials = () => {
    if (displayName) {
      return displayName.split(' ').map(n => n[0]).join('').toUpperCase()
    }
    return user?.email?.[0]?.toUpperCase() || 'U'
  }

  const formatJoinDate = () => {
    if (!userStats.joinDate) return ''
    return new Date(userStats.joinDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Profile</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      {/* User Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Account Information
          </CardTitle>
          <CardDescription>Your basic account details and statistics</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Profile Section */}
          <div className="flex items-center space-x-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={user?.user_metadata?.avatar_url} />
              <AvatarFallback className="text-lg">{getUserInitials()}</AvatarFallback>
            </Avatar>
            <div className="space-y-2 flex-1">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your display name"
                />
              </div>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center space-y-1">
              <div className="text-2xl font-bold text-primary">{userStats.totalEntries}</div>
              <div className="text-sm text-muted-foreground">Total Entries</div>
            </div>
            <div className="text-center space-y-1">
              <div className="text-2xl font-bold text-primary">{userStats.currentStreak}</div>
              <div className="text-sm text-muted-foreground">Current Streak</div>
            </div>
            <div className="text-center space-y-1">
              <div className="text-2xl font-bold text-primary">{userStats.longestStreak}</div>
              <div className="text-sm text-muted-foreground">Longest Streak</div>
            </div>
            <div className="text-center space-y-1">
              <div className="text-2xl font-bold text-primary">{userStats.totalDays}</div>
              <div className="text-sm text-muted-foreground">Days Active</div>
            </div>
          </div>

          {/* Join Date */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Member since</span>
            <Badge variant="secondary">{formatJoinDate()}</Badge>
          </div>

          <Button onClick={handleSaveProfile} disabled={isLoading} className="w-full">
            Save Profile Changes
          </Button>
        </CardContent>
      </Card>

      {/* Preferences Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Preferences
          </CardTitle>
          <CardDescription>Customize your app experience</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Theme Selection */}
          <div className="space-y-2">
            <Label>Theme</Label>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">
                  <div className="flex items-center gap-2">
                    <Sun className="h-4 w-4" />
                    Light
                  </div>
                </SelectItem>
                <SelectItem value="dark">
                  <div className="flex items-center gap-2">
                    <Moon className="h-4 w-4" />
                    Dark
                  </div>
                </SelectItem>
                <SelectItem value="system">
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    System
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Units */}
          <div className="space-y-2">
            <Label>Units</Label>
            <Select 
              value={preferences.units} 
              onValueChange={(value: 'metric' | 'imperial') => 
                setPreferences(prev => ({ ...prev, units: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="metric">Metric (kg, cm)</SelectItem>
                <SelectItem value="imperial">Imperial (lbs, in)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Daily Reminder */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>Daily Reminder</Label>
                <p className="text-sm text-muted-foreground">Get reminded to log your meals</p>
              </div>
              <Button
                variant={preferences.reminderEnabled ? "default" : "outline"}
                size="sm"
                onClick={() => setPreferences(prev => ({ 
                  ...prev, 
                  reminderEnabled: !prev.reminderEnabled 
                }))}
              >
                {preferences.reminderEnabled ? 'Enabled' : 'Disabled'}
              </Button>
            </div>

            {preferences.reminderEnabled && (
              <div className="space-y-2">
                <Label htmlFor="reminderTime">Reminder Time</Label>
                <Input
                  id="reminderTime"
                  type="time"
                  value={preferences.reminderTime}
                  onChange={(e) => setPreferences(prev => ({ 
                    ...prev, 
                    reminderTime: e.target.value 
                  }))}
                />
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Push Notifications</Label>
              <p className="text-sm text-muted-foreground">Receive insights and streak notifications</p>
            </div>
            <Button
              variant={preferences.notificationsEnabled ? "default" : "outline"}
              size="sm"
              onClick={() => setPreferences(prev => ({ 
                ...prev, 
                notificationsEnabled: !prev.notificationsEnabled 
              }))}
            >
              <Bell className="h-4 w-4 mr-1" />
              {preferences.notificationsEnabled ? 'On' : 'Off'}
            </Button>
          </div>

          {/* Journal Mode Default */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Private Mode by Default</Label>
              <p className="text-sm text-muted-foreground">New entries won&apos;t be included in insights</p>
            </div>
            <Button
              variant={preferences.journalModeDefault ? "default" : "outline"}
              size="sm"
              onClick={() => setPreferences(prev => ({ 
                ...prev, 
                journalModeDefault: !prev.journalModeDefault 
              }))}
            >
              {preferences.journalModeDefault ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>

          <Button onClick={handleSavePreferences} disabled={isLoading} className="w-full">
            Save Preferences
          </Button>
        </CardContent>
      </Card>

      {/* Data Management Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Data Management
          </CardTitle>
          <CardDescription>Export or manage your wellness data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Export Data */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <h4 className="font-medium">Export Your Data</h4>
              <p className="text-sm text-muted-foreground">
                Download all your mood and food entries as CSV files
              </p>
            </div>
            <Button 
              onClick={handleExportData} 
              disabled={isLoading}
              variant="outline"
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>

          {/* Account Actions */}
          <Separator />
          
          <div className="space-y-4">
            <h4 className="font-medium text-destructive">Danger Zone</h4>
            
            {/* Sign Out */}
            <div className="flex items-center justify-between p-4 border border-orange-200 rounded-lg">
              <div className="space-y-1">
                <h4 className="font-medium">Sign Out</h4>
                <p className="text-sm text-muted-foreground">Sign out of your account</p>
              </div>
              <Button onClick={signOut} variant="outline">
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>

            {/* Delete Account */}
            <div className="flex items-center justify-between p-4 border border-red-200 rounded-lg">
              <div className="space-y-1">
                <h4 className="font-medium text-destructive">Delete Account</h4>
                <p className="text-sm text-muted-foreground">
                  Permanently delete your account and all data
                </p>
              </div>
              <Button 
                onClick={handleDeleteAccount}
                disabled={isLoading}
                variant="destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {showDeleteConfirm ? 'Confirm Delete' : 'Delete Account'}
              </Button>
            </div>

            {showDeleteConfirm && (
              <Alert>
                <AlertDescription>
                  This action cannot be undone. All your data will be permanently deleted.
                  Click &quot;Confirm Delete&quot; again to proceed.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}