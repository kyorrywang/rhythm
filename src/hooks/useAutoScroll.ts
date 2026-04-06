import { useEffect, useRef, useState, useCallback } from 'react';

export function useAutoScroll(dependency: unknown) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isUserAtBottom, setIsUserAtBottom] = useState(true);

  const checkIfAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 50;
    setIsUserAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < threshold);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener('scroll', checkIfAtBottom);
    return () => el.removeEventListener('scroll', checkIfAtBottom);
  }, [checkIfAtBottom]);

  useEffect(() => {
    if (isUserAtBottom && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [dependency, isUserAtBottom]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      setIsUserAtBottom(true);
    }
  }, []);

  return { scrollRef, isUserAtBottom, scrollToBottom };
}
