'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Mic, MicOff, Play, Pause, Square, Loader2, Trash2, Edit, Check } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { AISpeechResponseSchema, type AISpeechResponse } from '@/lib/validations'
import { toast } from 'sonner'

interface VoiceRecorderProps {
  date: string
  selectedMeal?: string // Pre-selected meal type from parent
  onAnalysisComplete?: (result: {
    meal: string
    foods: Array<{ label: string; confidence: number; quantity?: string }>
    nutrition: { calories: number; macros: { protein: number; carbs: number; fat: number } }
    transcript: string
    voiceUrl: string
  }) => void
  className?: string
}

export function VoiceRecorder({ date, selectedMeal, onAnalysisComplete, className }: VoiceRecorderProps) {
  const { user } = useAuth()
  const [isRecording, setIsRecording] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [analysis, setAnalysis] = useState<AISpeechResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [browserSupported, setBrowserSupported] = useState<boolean | null>(null)

  // Review/editing state
  const [isEditing, setIsEditing] = useState(false)
  const [editedMeal, setEditedMeal] = useState<string>('')
  const [editedCalories, setEditedCalories] = useState<number>(0)
  const [editedProtein, setEditedProtein] = useState<number>(0)
  const [editedCarbs, setEditedCarbs] = useState<number>(0)
  const [editedFat, setEditedFat] = useState<number>(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Check browser compatibility on mount
  useEffect(() => {
    const checkBrowserSupport = () => {
      try {
        const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
        const hasMediaRecorder = typeof MediaRecorder !== 'undefined'
        const isHttps = location.protocol === 'https:' || location.hostname === 'localhost'
        
        const supported = hasMediaDevices && hasMediaRecorder && isHttps
        setBrowserSupported(supported)
        
        if (!supported) {
          let message = 'Voice recording not available: '
          if (!isHttps) message += 'HTTPS required. '
          if (!hasMediaDevices) message += 'Browser too old. '
          if (!hasMediaRecorder) message += 'MediaRecorder not supported. '
          setError(message + 'Please update your browser or use Chrome.')
        }
      } catch {
        setBrowserSupported(false)
        setError('Browser compatibility check failed. Please try a different browser.')
      }
    }
    
    checkBrowserSupport()
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
    }
  }, [audioUrl])

  // Reset state
  const resetState = useCallback(() => {
    setAudioBlob(null)
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }
    setAudioUrl(null)
    setDuration(0)
    setAnalysis(null)
    setError(null)
    setIsPlaying(false)
    setIsRecording(false)
    
    // Clear the timer interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [audioUrl])

  // This function is currently unused but kept for potential future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const checkMicrophonePermission = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices not supported')
      }

      // On iOS Safari, we need to request permission by actually trying to access the microphone
      // This is different from desktop browsers that have a permissions API
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      // If we got here, permission was granted - immediately stop the stream
      stream.getTracks().forEach(track => track.stop())
      return true
    } catch (err) {
      console.error('Microphone permission check failed:', err)
      return false
    }
  }, [])

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      // Clear any previous errors first
      setError(null)
      
      // More comprehensive browser support check
      if (!navigator.mediaDevices) {
        // Fallback for older browsers
        const navWithLegacy = navigator as Navigator & {
          getUserMedia?: MediaStreamConstraints
          webkitGetUserMedia?: MediaStreamConstraints  
          mozGetUserMedia?: MediaStreamConstraints
        }
        if (navWithLegacy.getUserMedia || navWithLegacy.webkitGetUserMedia || navWithLegacy.mozGetUserMedia) {
          console.log('Using legacy getUserMedia')
          // Could implement legacy support but modern iOS Safari supports mediaDevices
          throw new Error('Your browser version is outdated. Please update Safari or try Chrome.')
        } else {
          throw new Error('Audio recording not supported. Please update your browser or try a different one.')
        }
      }

      if (!navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not available. Please ensure you are using HTTPS and a modern browser.')
      }

      // Check if we're on HTTPS (required for iOS Safari)
      if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
        throw new Error('Microphone access requires HTTPS. Please use https:// instead of http://')
      }

      // iOS Safari requires user activation - this function should only be called from user gesture

      // Request microphone access with iOS Safari compatible constraints
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true // Simplified for iOS compatibility
      })

      // Determine the best MIME type for the platform
      let mimeType = 'audio/webm;codecs=opus'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        // Fallback for Safari/iOS
        const safariTypes = [
          'audio/mp4',
          'audio/aac', 
          'audio/mpeg',
          'audio/wav',
          'audio/webm'
        ]
        
        mimeType = safariTypes.find(type => MediaRecorder.isTypeSupported(type)) || ''
      }

      const mediaRecorderOptions = mimeType ? { mimeType } : undefined
      const mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions)

      const chunks: BlobPart[] = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        // Use the actual mimeType that was successfully initialized
        const blob = new Blob(chunks, { type: mimeType || 'audio/webm' })
        setAudioBlob(blob)
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
        
        // Clear the timer interval when recording stops
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setIsRecording(true)
      setError(null)

      // Start duration timer
      intervalRef.current = setInterval(() => {
        setDuration(prev => prev + 1)
      }, 1000)

    } catch (err) {
      console.error('Failed to start recording:', err)
      
      let errorMessage = 'Failed to access microphone.'
      
      if (err instanceof DOMException) {
        switch (err.name) {
          case 'NotAllowedError':
            errorMessage = 'Microphone access denied. On iOS Safari: Tap the AA icon in the address bar → Website Settings → Enable Microphone.'
            break
          case 'NotFoundError':
            errorMessage = 'No microphone found. Please ensure your device has a microphone and isn&apos;t muted.'
            break
          case 'NotReadableError':
            errorMessage = 'Microphone is already in use by another app. Please close other apps and try again.'
            break
          case 'OverconstrainedError':
            errorMessage = 'Microphone constraints not supported. Try refreshing the page.'
            break
          case 'AbortError':
            errorMessage = 'Microphone access was aborted. Please try again.'
            break
          case 'NotSupportedError':
            errorMessage = 'Audio recording is not supported in this browser version. Please update iOS and Safari.'
            break
          default:
            errorMessage = `Microphone error: ${err.message}. Try refreshing or updating your browser.`
        }
      } else if (err instanceof Error) {
        errorMessage = err.message
      }
      
      setError(errorMessage)
    }
  }, [])

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isRecording])

  // Play audio
  const playAudio = useCallback(() => {
    if (audioUrl && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
        setIsPlaying(false)
      } else {
        audioRef.current.play()
        setIsPlaying(true)
      }
    }
  }, [audioUrl, isPlaying])

  // Handle audio events
  const handleAudioEnded = () => {
    setIsPlaying(false)
  }

  // Upload and analyze audio
  const uploadAndAnalyze = useCallback(async () => {
    if (!audioBlob || !user) {
      toast.error('No audio to analyze')
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      // Convert to the right format and upload directly via FormData
      const formData = new FormData()
      
      // Detect the actual audio format based on the blob type
      const blobType = audioBlob.type || 'audio/webm'
      const extension = blobType.includes('mp4') ? '.m4a' : 
                       blobType.includes('aac') ? '.aac' :
                       blobType.includes('mpeg') ? '.mp3' :
                       blobType.includes('wav') ? '.wav' : '.webm'
      
      const audioFile = new File([audioBlob], `voice-${Date.now()}${extension}`, {
        type: blobType
      })
      
      formData.append('audio', audioFile)
      formData.append('userId', user.id)
      formData.append('date', date)

      setIsAnalyzing(true)
      
      // Call speech API directly with audio file
      const response = await fetch('/api/ai/speech', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.text()
        console.error('Speech API error:', errorData)
        throw new Error(`Speech analysis failed: ${response.status}`)
      }

      const result = await response.json()
      console.log('Speech analysis result:', result)
      
      const validatedResult = AISpeechResponseSchema.parse(result)
      setAnalysis(validatedResult)

      // Initialize editing state with AI results, but prefer user's original selection
      setEditedMeal(selectedMeal || validatedResult.meal)
      setEditedCalories(validatedResult.nutrition.calories)
      setEditedProtein(validatedResult.nutrition.macros.protein)
      setEditedCarbs(validatedResult.nutrition.macros.carbs)
      setEditedFat(validatedResult.nutrition.macros.fat)

      toast.success('Voice analysis completed! Please review and confirm.')

    } catch (error) {
      console.error('Voice analysis error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to analyze voice recording'
      setError(errorMessage)
      toast.error(`Voice analysis failed: ${errorMessage}`)
    } finally {
      setIsUploading(false)
      setIsAnalyzing(false)
    }
  }, [audioBlob, user, date, selectedMeal])

  // Submit the final result
  const submitResult = useCallback(() => {
    if (!analysis || !onAnalysisComplete) return

    onAnalysisComplete({
      meal: editedMeal,
      foods: analysis.foods.map(food => ({
        label: food.label,
        confidence: food.confidence,
        quantity: food.quantity
      })),
      nutrition: {
        calories: editedCalories,
        macros: {
          protein: editedProtein,
          carbs: editedCarbs,
          fat: editedFat
        }
      },
      transcript: analysis.transcript,
      voiceUrl: audioUrl || ''
    })

    // Clear the timer when submitting to prevent it from continuing
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    toast.success('Food entry saved!')
  }, [analysis, onAnalysisComplete, editedMeal, editedCalories, editedProtein, editedCarbs, editedFat, audioUrl])

  // Start editing
  const startEditing = () => {
    setIsEditing(true)
  }

  // Cancel editing
  const cancelEditing = () => {
    if (!analysis) return
    
    // Reset to original values
    setEditedMeal(selectedMeal || analysis.meal)
    setEditedCalories(analysis.nutrition.calories)
    setEditedProtein(analysis.nutrition.macros.protein)
    setEditedCarbs(analysis.nutrition.macros.carbs)
    setEditedFat(analysis.nutrition.macros.fat)
    setIsEditing(false)
  }

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const isLoading = isUploading || isAnalyzing

  return (
    <div className={className}>
      <Card>
        <CardContent className="p-6 space-y-4">
          {!audioBlob ? (
            // Recording interface
            <div className="text-center space-y-4">
              <div className="relative">
                <Button
                  size="lg"
                  variant={isRecording ? "destructive" : "default"}
                  className="h-24 w-24 rounded-full"
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isLoading || browserSupported === false}
                >
                  {isRecording ? (
                    <Square className="h-8 w-8" />
                  ) : (
                    <Mic className="h-8 w-8" />
                  )}
                </Button>
                
                {isRecording && (
                  <div className="absolute -top-2 -right-2">
                    <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse" />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="font-medium">
                  {isRecording ? 'Recording...' : 'Record Voice Note'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {browserSupported === false ? (
                    'Voice recording not available in this browser'
                  ) : isRecording ? (
                    `Recording: ${formatDuration(duration)}`
                  ) : (
                    'Describe your meal and I&apos;ll extract the details'
                  )}
                </p>
              </div>

              {isRecording && (
                <Button onClick={stopRecording} variant="outline">
                  <MicOff className="h-4 w-4 mr-2" />
                  Stop Recording
                </Button>
              )}
            </div>
          ) : (
            // Playback and analysis interface
            <div className="space-y-4">
              {/* Audio controls */}
              <div className="flex items-center justify-between p-4 bg-muted rounded-md">
                <div className="flex items-center space-x-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={playAudio}
                    disabled={isLoading}
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <span className="text-sm font-medium">
                    Voice Note ({formatDuration(duration)})
                  </span>
                </div>
                
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={resetState}
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Hidden audio element */}
              {audioUrl && (
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  onEnded={handleAudioEnded}
                  className="hidden"
                />
              )}

              {/* Analyze button */}
              {!analysis && (
                <Button 
                  onClick={uploadAndAnalyze} 
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {isUploading ? 'Uploading...' : 'Analyzing...'}
                    </>
                  ) : (
                    'Analyze with AI'
                  )}
                </Button>
              )}

              {/* Analysis Results */}
              {analysis && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">
                      {isEditing ? 'Edit Food Entry' : 'Review AI Analysis'}
                    </h4>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{analysis.provider}</Badge>
                      {!isEditing && (
                        <Button size="sm" variant="outline" onClick={startEditing}>
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Transcript */}
                  <div className="space-y-2">
                    <h5 className="text-sm font-medium">Transcript:</h5>
                    <p className="text-sm bg-muted p-3 rounded-md italic">
                      &quot;{analysis.transcript}&quot;
                    </p>
                  </div>

                  {/* Meal type */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Meal Type:</Label>
                    {isEditing ? (
                      <Select value={editedMeal} onValueChange={setEditedMeal}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="breakfast">🌅 Breakfast</SelectItem>
                          <SelectItem value="lunch">☀️ Lunch</SelectItem>
                          <SelectItem value="dinner">🌙 Dinner</SelectItem>
                          <SelectItem value="snack">🍎 Snack</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize">
                          {editedMeal}
                        </Badge>
                        {selectedMeal && editedMeal !== analysis.meal && (
                          <Badge variant="secondary" className="text-xs">
                            AI suggested: {analysis.meal}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Detected Foods */}
                  <div className="space-y-2">
                    <h5 className="text-sm font-medium">Detected Foods:</h5>
                    <div className="flex flex-wrap gap-2">
                      {analysis.foods.map((food, index: number) => (
                        <Badge key={index} variant="outline">
                          {food.label}
                          {food.confidence && (
                            <span className="ml-1 text-xs opacity-70">
                              ({Math.round(food.confidence * 100)}%)
                            </span>
                          )}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Nutrition Info */}
                  {isEditing ? (
                    <div className="space-y-4">
                      <h5 className="text-sm font-medium">Nutrition Information:</h5>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="calories">Calories</Label>
                          <Input
                            id="calories"
                            type="number"
                            value={editedCalories}
                            onChange={(e) => setEditedCalories(Number(e.target.value))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="protein">Protein (g)</Label>
                          <Input
                            id="protein"
                            type="number"
                            value={editedProtein}
                            onChange={(e) => setEditedProtein(Number(e.target.value))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="carbs">Carbs (g)</Label>
                          <Input
                            id="carbs"
                            type="number"
                            value={editedCarbs}
                            onChange={(e) => setEditedCarbs(Number(e.target.value))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="fat">Fat (g)</Label>
                          <Input
                            id="fat"
                            type="number"
                            value={editedFat}
                            onChange={(e) => setEditedFat(Number(e.target.value))}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-md">
                      <div className="text-center">
                        <div className="font-semibold text-lg">{editedCalories}</div>
                        <div className="text-xs text-muted-foreground">Calories</div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-lg">{editedProtein}g</div>
                        <div className="text-xs text-muted-foreground">Protein</div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-lg">{editedCarbs}g</div>
                        <div className="text-xs text-muted-foreground">Carbs</div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-lg">{editedFat}g</div>
                        <div className="text-xs text-muted-foreground">Fat</div>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2">
                    {isEditing ? (
                      <>
                        <Button onClick={() => setIsEditing(false)} className="flex-1">
                          <Check className="h-4 w-4 mr-2" />
                          Save Changes
                        </Button>
                        <Button variant="outline" onClick={cancelEditing}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button onClick={submitResult} className="flex-1">
                        <Check className="h-4 w-4 mr-2" />
                        Confirm & Save
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <div className="space-y-3">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          
          {/* iOS Safari specific help */}
          {(error.includes('Safari') || error.includes('iOS') || error.includes('denied') || error.includes('not supported')) && (
            <Alert>
              <AlertDescription>
                <strong>📱 iOS Safari Troubleshooting:</strong>
                <br />
                {error.includes('denied') || error.includes('NotAllowed') ? (
                  <>
                    1. Tap the <strong>🔒 AA</strong> icon in Safari&apos;s address bar
                    <br />2. Tap <strong>Website Settings</strong>
                    <br />3. Toggle <strong>Microphone</strong> to <strong>Allow</strong>
                    <br />4. Refresh this page and try again
                  </>
                ) : error.includes('not supported') || error.includes('NotSupported') ? (
                  <>
                    1. Update to iOS 14.3+ (Settings → General → Software Update)
                    <br />2. Try closing Safari completely and reopening
                    <br />3. Alternative: Use <strong>Chrome for iOS</strong> instead
                    <br />4. Ensure HTTPS connection (look for 🔒 in address bar)
                  </>
                ) : error.includes('HTTPS') ? (
                  <>
                    <strong>🔒 HTTPS Required:</strong> Microphone needs secure connection.
                    <br />Please use https:// instead of http:// to access this page.
                  </>
                ) : (
                  <>
                    1. Check device isn&apos;t muted (side switch)
                    <br />2. Close other apps using microphone (FaceTime, Voice Memos)
                    <br />3. Try airplane mode on/off to reset network
                    <br />4. Last resort: Restart your device
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  )
}