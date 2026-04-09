'use client'

import { format } from 'date-fns'
import { Edit, Trash2, Loader2 } from 'lucide-react'
import type { FoodEntry } from '@/lib/types/database'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface RecentEntriesListProps {
  title: string
  description: string
  entries: FoodEntry[]
  loading: boolean
  loadingText: string
  emptyTitle: string
  emptyDescription: string
  emptyCtaLabel?: string
  onEmptyCta?: () => void
  onEditEntry: (entry: FoodEntry) => void
  onDeleteEntry: (entry: FoodEntry) => void
}

export function RecentEntriesList({
  title,
  description,
  entries,
  loading,
  loadingText,
  emptyTitle,
  emptyDescription,
  emptyCtaLabel,
  onEmptyCta,
  onEditEntry,
  onDeleteEntry,
}: RecentEntriesListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">{loadingText}</span>
            </div>
          ) : entries.length > 0 ? (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between p-4 border rounded-lg bg-background transition-all duration-200 hover:bg-muted/50 hover:shadow-sm animate-in fade-in slide-in-from-bottom-1"
              >
                <div className="flex items-center space-x-4">
                  <span className="text-2xl">{entry.food_labels?.[0] ? '🍽️' : '📝'}</span>
                  <div>
                    <div className="font-medium">{entry.food_labels?.join(', ') || 'Food entry'}</div>
                    <div className="text-sm text-muted-foreground">
                      {entry.meal} • {format(new Date(entry.created_at), 'MMM d, h:mm a')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{entry.calories ? `${entry.calories} cal` : 'No cal data'}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => onEditEntry(entry)} aria-label="Edit entry">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDeleteEntry(entry)}
                    aria-label="Delete entry"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center text-muted-foreground py-8">
              <span className="text-4xl block mb-4">🍽️</span>
              <p>{emptyTitle}</p>
              <p className="text-sm">{emptyDescription}</p>
              {emptyCtaLabel && onEmptyCta ? (
                <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onEmptyCta}>
                  {emptyCtaLabel}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
