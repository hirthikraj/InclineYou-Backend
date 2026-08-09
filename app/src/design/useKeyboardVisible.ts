/**
 * True while the soft keyboard is up.
 *
 * The keyboard eats ~46% of a 390pt screen, so several layouts in this app drop
 * what they can rather than pushing the primary action below the fold. It is
 * also the gate for `KeyboardAvoidingView` on Android — see the long note in
 * `screens/auth/authLayout.tsx` about the stale `keyboardDidHide` payload under
 * edge-to-edge.
 *
 * iOS uses the `Will` events so the layout moves with the keyboard rather than
 * after it; Android only ever fires the `Did` pair.
 */

import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export default function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setVisible(true),
    );
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}
