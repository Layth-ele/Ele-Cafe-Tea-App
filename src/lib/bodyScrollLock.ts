let lockCount = 0;
let cachedScrollbarWidth: number | null = null;
let prevOverflow = '';
let prevPaddingRight = '';

function scrollbarWidth() {
  if (cachedScrollbarWidth != null) return cachedScrollbarWidth;
  cachedScrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  return cachedScrollbarWidth;
}

export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {};

  lockCount += 1;
  if (lockCount === 1) {
    const body = document.body;
    prevOverflow = body.style.overflow;
    prevPaddingRight = body.style.paddingRight;
    const width = scrollbarWidth();
    body.style.overflow = 'hidden';
    if (width > 0) body.style.paddingRight = `${width}px`;
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      const body = document.body;
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
    }
  };
}

export function __resetBodyScrollLock() {
  lockCount = 0;
  cachedScrollbarWidth = null;
  prevOverflow = '';
  prevPaddingRight = '';
}
