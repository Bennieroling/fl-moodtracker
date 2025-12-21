"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

interface PopoverContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  triggerRef: React.RefObject<HTMLElement>
  contentRef: React.RefObject<HTMLDivElement>
}

const PopoverContext = React.createContext<PopoverContextValue | null>(null)

function usePopoverContext(component: string) {
  const context = React.useContext(PopoverContext)
  if (!context) {
    throw new Error(`${component} must be used within a <Popover />`)
  }
  return context
}

const Popover = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLElement>(null)
  const contentRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return

    function handlePointer(event: MouseEvent | TouchEvent) {
      const target = event.target as Node
      if (
        !contentRef.current ||
        !triggerRef.current ||
        contentRef.current.contains(target) ||
        triggerRef.current.contains(target)
      ) {
        return
      }
      setOpen(false)
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handlePointer)
    document.addEventListener("touchstart", handlePointer)
    document.addEventListener("keydown", handleKey)

    return () => {
      document.removeEventListener("mousedown", handlePointer)
      document.removeEventListener("touchstart", handlePointer)
      document.removeEventListener("keydown", handleKey)
    }
  }, [open])

  const value = React.useMemo(
    () => ({
      open,
      setOpen,
      triggerRef,
      contentRef,
    }),
    [open]
  )

  return (
    <PopoverContext.Provider value={value}>
      <div className="relative inline-flex">{children}</div>
    </PopoverContext.Provider>
  )
}

interface PopoverTriggerProps extends React.HTMLAttributes<HTMLElement> {
  asChild?: boolean
  children: React.ReactElement
}

const PopoverTrigger = React.forwardRef<HTMLElement, PopoverTriggerProps>(
  ({ children, asChild = false, ...props }, ref) => {
    const { open, setOpen, triggerRef } = usePopoverContext("PopoverTrigger")

    const child = asChild ? React.Children.only(children) : children

    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault()
      setOpen(!open)
      child.props?.onClick?.(event)
    }

    return React.cloneElement(child, {
      ref: (node: HTMLElement) => {
        triggerRef.current = node
        if (typeof ref === "function") {
          ref(node)
        } else if (ref) {
          ;(ref as React.MutableRefObject<HTMLElement | null>).current = node
        }
        if (typeof child.ref === "function") {
          child.ref(node)
        } else if (child.ref) {
          ;(child.ref as React.MutableRefObject<HTMLElement | null>).current = node
        }
      },
      onClick: handleClick,
      ...props,
    })
  }
)
PopoverTrigger.displayName = "PopoverTrigger"

interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: "start" | "center" | "end"
}

const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  ({ className, align = "center", children, ...props }, ref) => {
    const { open, contentRef } = usePopoverContext("PopoverContent")

    if (!open) return null

    const alignmentClass =
      align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2"

    return (
      <div
        ref={(node) => {
          contentRef.current = node
          if (typeof ref === "function") {
            ref(node)
          } else if (ref) {
            ;(ref as React.MutableRefObject<HTMLDivElement | null>).current = node
          }
        }}
        className={cn(
          "absolute z-50 mt-2 min-w-[200px] rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none",
          alignmentClass,
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
PopoverContent.displayName = "PopoverContent"

export { Popover, PopoverTrigger, PopoverContent }
