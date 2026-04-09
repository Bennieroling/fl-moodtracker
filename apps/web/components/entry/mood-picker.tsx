'use client'

export const moodEmojis = [
  { score: 1, emoji: '😢', label: 'Very Bad' },
  { score: 2, emoji: '😞', label: 'Bad' },
  { score: 3, emoji: '😐', label: 'Okay' },
  { score: 4, emoji: '🙂', label: 'Good' },
  { score: 5, emoji: '😄', label: 'Great' },
]

interface MoodPickerProps {
  selectedMood: number | null
  onMoodSelect: (mood: number) => void | Promise<void>
}

export function MoodPicker({ selectedMood, onMoodSelect }: MoodPickerProps) {
  return (
    <div className="flex justify-center flex-wrap gap-3">
      {moodEmojis.map((mood) => (
        <button
          key={mood.score}
          type="button"
          onClick={() => onMoodSelect(mood.score)}
          className={`p-3 rounded-full transition-all ${
            selectedMood === mood.score
              ? 'bg-primary text-primary-foreground scale-110 shadow-lg animate-pulse'
              : 'hover:bg-muted hover:scale-110 hover:shadow-md'
          }`}
          title={mood.label}
          aria-label={`Set mood: ${mood.label}`}
        >
          <span className="text-2xl">{mood.emoji}</span>
        </button>
      ))}
    </div>
  )
}
