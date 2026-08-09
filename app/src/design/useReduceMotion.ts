/**
 * Whether the OS has asked for reduced motion.
 *
 * Subscribed rather than read once: it is a setting people turn on mid-session,
 * usually because something on screen has just made them feel unwell, and an
 * app that keeps animating until the next launch has missed the point.
 *
 * Everything in this system treats it as "hold still", not "hide" — a drawer
 * still opens, it just arrives instead of travelling.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export default function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (live) setReduced(value);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
