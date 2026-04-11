import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

type FollowMode = 'following' | 'detached';
type ScrollSource = 'user' | 'programmatic';

const BOTTOM_THRESHOLD_PX = 48;

export function useAutoScroll(contentVersion: string) {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null);
  const [isUserAtBottom, setIsUserAtBottom] = useState(true);
  const followModeRef = useRef<FollowMode>('following');
  const programmaticScrollRef = useRef(false);
  const previousContentVersionRef = useRef(contentVersion);
  const lastObservedScrollHeightRef = useRef(0);

  const scrollRef = useCallback((node: HTMLDivElement | null) => {
    setScrollElement(node);
  }, []);

  const contentRef = useCallback((node: HTMLDivElement | null) => {
    setContentElement(node);
  }, []);

  const measureIsAtBottom = useCallback((element: HTMLDivElement | null) => {
    if (!element) return true;
    return element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_THRESHOLD_PX;
  }, []);

  const syncBottomState = useCallback((source: ScrollSource = 'user') => {
    const nextIsAtBottom = measureIsAtBottom(scrollElement);
    setIsUserAtBottom(nextIsAtBottom);

    if (source === 'programmatic') {
      if (nextIsAtBottom) {
        followModeRef.current = 'following';
      }
      return nextIsAtBottom;
    }

    followModeRef.current = nextIsAtBottom ? 'following' : 'detached';
    return nextIsAtBottom;
  }, [measureIsAtBottom, scrollElement]);

  const scrollToBottom = useCallback(() => {
    if (!scrollElement) return;
    followModeRef.current = 'following';
    setIsUserAtBottom(true);
    programmaticScrollRef.current = true;
    scrollElement.scrollTop = scrollElement.scrollHeight;
    window.requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
      syncBottomState('programmatic');
    });
  }, [scrollElement, syncBottomState]);

  useEffect(() => {
    if (!scrollElement) return;

    lastObservedScrollHeightRef.current = scrollElement.scrollHeight;
    syncBottomState('programmatic');

    const handleScroll = () => {
      syncBottomState(programmaticScrollRef.current ? 'programmatic' : 'user');
    };

    scrollElement.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      scrollElement.removeEventListener('scroll', handleScroll);
    };
  }, [scrollElement, syncBottomState]);

  useEffect(() => {
    if (!scrollElement || !contentElement || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      const nextScrollHeight = scrollElement.scrollHeight;
      if (nextScrollHeight === lastObservedScrollHeightRef.current) return;
      lastObservedScrollHeightRef.current = nextScrollHeight;

      if (followModeRef.current === 'following') {
        scrollToBottom();
      } else {
        syncBottomState('programmatic');
      }
    });

    observer.observe(contentElement);

    return () => observer.disconnect();
  }, [contentElement, scrollElement, scrollToBottom, syncBottomState]);

  useLayoutEffect(() => {
    const changed = previousContentVersionRef.current !== contentVersion;
    previousContentVersionRef.current = contentVersion;
    if (!changed) return;
    if (followModeRef.current !== 'following') return;
    scrollToBottom();
  }, [contentVersion, scrollToBottom]);

  return { scrollRef, contentRef, isUserAtBottom, scrollToBottom };
}
