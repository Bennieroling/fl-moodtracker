'use client'

import { useState, useRef, useCallback } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Camera, Upload, Loader2, X, Image as ImageIcon, Edit, Check } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { MealTypeSchema, AIVisionResponseSchema, type AIVisionResponse } from '@/lib/validations'
import { toast } from 'sonner'

interface PhotoUploaderProps {
  meal: string
  date: string
  onAnalysisComplete?: (result: {
    foods: Array<{ label: string; confidence: number; quantity?: string }>
    nutrition: { calories: number; macros: { protein: number; carbs: number; fat: number } }
    photoUrl: string
  }) => void
  className?: string
}

export function PhotoUploader({ meal, date, onAnalysisComplete, className }: PhotoUploaderProps) {
  const { user } = useAuth()
  const [isUploading, setIsUploading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<AIVisionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Review/editing state
  const [isEditing, setIsEditing] = useState(false)
  const [editedMeal, setEditedMeal] = useState<string>('')
  const [editedCalories, setEditedCalories] = useState<number>(0)
  const [editedProtein, setEditedProtein] = useState<number>(0)
  const [editedCarbs, setEditedCarbs] = useState<number>(0)
  const [editedFat, setEditedFat] = useState<number>(0)
  const [photoUrl, setPhotoUrl] = useState<string>('')

  // Reset state
  const resetState = useCallback(() => {
    setPreview(null)
    setAnalysis(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  // Handle file selection
  const handleFileSelect = useCallback(async (file: File) => {
    if (!user) {
      toast.error('Please log in to upload photos')
      return
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image size must be less than 10MB')
      return
    }

    setError(null)
    setIsUploading(true)

    try {
      // Create preview
      const previewUrl = URL.createObjectURL(file)
      setPreview(previewUrl)

      // Generate signed upload URL
      const uploadPath = `${user.id}/${Date.now()}-${file.name}`
      const signResponse = await fetch('/api/storage/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucket: 'food-photos',
          path: uploadPath,
          expiresIn: 3600
        })
      })

      if (!signResponse.ok) {
        throw new Error('Failed to get upload URL')
      }

      const { signedUrl } = await signResponse.json()

      // Upload file to Supabase Storage
      const uploadResponse = await fetch(signedUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type
        }
      })

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload image')
      }

      // Get public URL for AI analysis
      const publicUrlResponse = await fetch(`/api/storage/sign?bucket=food-photos&path=${uploadPath}&expiresIn=3600`)
      if (!publicUrlResponse.ok) {
        throw new Error('Failed to get image URL for analysis')
      }

      const { signedUrl: imageUrl } = await publicUrlResponse.json()

      setIsUploading(false)
      setIsAnalyzing(true)

      // Analyze image with AI
      const analysisResponse = await fetch('/api/ai/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl,
          userId: user.id,
          date,
          meal: MealTypeSchema.parse(meal)
        })
      })

      if (!analysisResponse.ok) {
        const errorText = await analysisResponse.text()
        console.error('AI Vision API Error:', {
          status: analysisResponse.status,
          statusText: analysisResponse.statusText,
          body: errorText
        })
        throw new Error(`Failed to analyze image: ${analysisResponse.status} - ${errorText}`)
      }

      const analysisResult = await analysisResponse.json()
      const validatedResult = AIVisionResponseSchema.parse(analysisResult)

      setAnalysis(validatedResult)
      setPhotoUrl(imageUrl)

      // Initialize editing state with AI results
      setEditedMeal(meal)
      setEditedCalories(validatedResult.nutrition.calories)
      setEditedProtein(validatedResult.nutrition.macros.protein)
      setEditedCarbs(validatedResult.nutrition.macros.carbs)
      setEditedFat(validatedResult.nutrition.macros.fat)

      toast.success('Photo analyzed successfully! Please review and confirm.')

    } catch (err) {
      console.error('Photo upload/analysis error:', err)
      setError(err instanceof Error ? err.message : 'Upload failed')
      toast.error('Failed to process photo')
    } finally {
      setIsUploading(false)
      setIsAnalyzing(false)
    }
  }, [user, meal, date])

  // Submit the final result
  const submitResult = useCallback(() => {
    if (!analysis || !onAnalysisComplete) return

    onAnalysisComplete({
      foods: analysis.foods,
      nutrition: {
        calories: editedCalories,
        macros: {
          protein: editedProtein,
          carbs: editedCarbs,
          fat: editedFat
        }
      },
      photoUrl: photoUrl
    })
  }, [analysis, onAnalysisComplete, editedCalories, editedProtein, editedCarbs, editedFat, photoUrl])

  // Start editing
  const startEditing = () => {
    setIsEditing(true)
  }

  // Cancel editing
  const cancelEditing = () => {
    if (!analysis) return
    
    // Reset to original values
    setEditedMeal(meal)
    setEditedCalories(analysis.nutrition.calories)
    setEditedProtein(analysis.nutrition.macros.protein)
    setEditedCarbs(analysis.nutrition.macros.carbs)
    setEditedFat(analysis.nutrition.macros.fat)
    setIsEditing(false)
  }

  // Handle file input change
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  // Handle drag and drop
  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  // Take photo (mobile camera)
  const handleTakePhoto = () => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('capture', 'camera')
      fileInputRef.current.click()
    }
  }

  // Upload from gallery
  const handleUploadPhoto = () => {
    if (fileInputRef.current) {
      fileInputRef.current.removeAttribute('capture')
      fileInputRef.current.click()
    }
  }

  const isLoading = isUploading || isAnalyzing

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {!preview && (
        <Card 
          className="border-dashed border-2 cursor-pointer hover:border-primary/50 transition-colors"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <CardContent className="p-8 text-center space-y-4">
            <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground" />
            <div className="space-y-2">
              <h3 className="font-medium">Upload Food Photo</h3>
              <p className="text-sm text-muted-foreground">
                Take a photo or upload from your gallery
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button onClick={handleTakePhoto} disabled={isLoading}>
                <Camera className="h-4 w-4 mr-2" />
                Take Photo
              </Button>
              <Button onClick={handleUploadPhoto} variant="outline" disabled={isLoading}>
                <Upload className="h-4 w-4 mr-2" />
                Upload Photo
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Max file size: 10MB. Supports JPG, PNG, WebP
            </p>
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card>
          <CardContent className="p-4 space-y-4">
            {/* Image Preview */}
            <div className="relative">
              <Image
                src={preview}
                alt="Food preview"
                width={400}
                height={192}
                className="w-full h-48 object-cover rounded-md"
              />
              {!isLoading && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={resetState}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center space-x-2 py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">
                  {isUploading ? 'Uploading...' : 'Analyzing with AI...'}
                </span>
              </div>
            )}

            {/* Review/Edit Analysis Results */}
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
                        <SelectItem value="lunch">🌞 Lunch</SelectItem>
                        <SelectItem value="dinner">🌙 Dinner</SelectItem>
                        <SelectItem value="snack">🍪 Snack</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline" className="capitalize">
                        {editedMeal === 'breakfast' && '🌅 '}
                        {editedMeal === 'lunch' && '🌞 '}
                        {editedMeal === 'dinner' && '🌙 '}
                        {editedMeal === 'snack' && '🍪 '}
                        {editedMeal}
                      </Badge>
                    </div>
                  )}
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
                      Save & Submit
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}