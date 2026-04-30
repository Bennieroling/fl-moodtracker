'use client'

import React, { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface MotionFadeProps {
  children: ReactNode
  className?: string
  delay?: number
}

export function MotionFade({ children, className, delay = 0 }: MotionFadeProps) {
  const prefersReducedMotion = useReducedMotion()

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  )
}
