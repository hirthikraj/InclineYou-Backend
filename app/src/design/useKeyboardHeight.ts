/**
 * The soft keyboard's height in points, 0 while it is down.
 *
 * `useKeyboardVisible` answers "is it up"; this answers "how far up". The two
 * exist separately because the hide payload cannot be trusted on Android under
 * edge-to-edge (see the long note in `screens/auth/authLayout.tsx`): its
 * `keyboardDidHide` reports a junk frame, so this hook never reads the hide
 * event's coordinates — hidden is hard-zero, always. The show path is the
 * correct one and is the only one measured.
 *
 * iOS uses the `Will` events so whatever is lifted moves with the keyboard
 * rather than after it; Android only ever fires the `Did` pair.
 */

import { useEffect, useState } from 'react';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';

export default function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(
      ios ? 'keyboardWillShow' : 'keyboardDidShow',
      (e: KeyboardEvent) => setHeight(e.endCoordinates?.height ?? 0),
    );
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setHeight(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
