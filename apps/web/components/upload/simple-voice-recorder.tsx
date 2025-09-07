'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Mic, MicOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface SimpleVoiceRecorderProps {
  date: string
  onAnalysisComplete?: (result: {
    meal: string
    foods: Array<{ label: string; confidence: number; quantity?: string }>
    nutrition: { calories: number; macros: { protein: number; carbs: number; fat: number } }
    transcript: string
    voiceUrl: string
  }) => void
  className?: string
}

export function SimpleVoiceRecorder({ className }: SimpleVoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleVoiceInput = () => {
    if (isRecording) {
      // Stop recording
      setIsRecording(false)
      setIsProcessing(true)
      
      // Show message that this feature requires real backend
      setTimeout(() => {
        setIsProcessing(false)
        toast.error('Voice recording requires a configured backend with AI services. Please use the full voice recorder component.')
      }, 1000)
      
    } else {
      // Start recording
      setIsRecording(true)
      toast.info('Recording started... Click stop when finished')
    }
  }

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="text-center space-y-4">
          <h3 className="font-medium">Voice Food Logger</h3>
          <p className="text-sm text-muted-foreground">
            {isRecording 
              ? 'Recording... Describe what you ate'
              : isProcessing
                ? 'Processing your recording...'
                : 'Click to start recording'
            }
          </p>
          
          <Button
            onClick={handleVoiceInput}
            disabled={isProcessing}
            variant={isRecording ? 'destructive' : 'default'}
            size="lg"
            className="w-full"
          >
            {isProcessing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : isRecording ? (
              <MicOff className="mr-2 h-4 w-4" />
            ) : (
              <Mic className="mr-2 h-4 w-4" />
            )}
            
            {isProcessing 
              ? 'Processing...' 
              : isRecording 
                ? 'Stop Recording' 
                : 'Start Recording'
            }
          </Button>
          
          <p className="text-xs text-muted-foreground">
            Simplified recorder - Use the main Voice tab for full AI processing
          </p>
        </div>
      </CardContent>
    </Card>
  )
}