/**
 * Bottom sheet.
 *
 * Drag-to-dismiss with a spring, because that is what an iOS sheet does and
 * anything less makes the app feel like a website.
 */

import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { useEffect, type ReactNode } from 'react'
import { Icon } from './Icon'

interface Props {
  open: boolean
  title?: ReactNode
  onClose(): void
  children: ReactNode
  /** Shown to the left of the close button, e.g. a Back control. */
  lead?: ReactNode
}

const DISMISS_DISTANCE = 110
const DISMISS_VELOCITY = 520

export function Sheet({ open, title, onClose, children, lead }: Props) {
  // A sheet that scrolls the page behind it reads as broken.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > DISMISS_DISTANCE || info.velocity.y > DISMISS_VELOCITY) onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            className="sheet"
            role="dialog"
            aria-modal="true"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.45 }}
            onDragEnd={handleDragEnd}
          >
            <div className="sheet__grip" />
            <div className="sheet__head">
              <div style={{ minWidth: 0 }}>
                {lead}
                {title && <h2 className="title-md">{title}</h2>}
              </div>
              <button className="sheet__close" onClick={onClose} aria-label="Close">
                <Icon name="close" size={17} strokeWidth={2.2} />
              </button>
            </div>
            <div className="sheet__body">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
