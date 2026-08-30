import type { Message } from '@/lib/auth/copy';
import { IconCheck, IconClock, IconLock, IconWarn } from './Icons';

/**
 * §05 · the message slot.
 *
 * ALWAYS PRESENT. It keeps its height whether or not it holds anything, so
 * nothing below it moves when a code is refused — the layout jump a message
 * appearing between the field and the button causes is the reason the mobile
 * spec asks for an always-present `aria-live` region rather than a conditional
 * one, and a slot that only exists when it has something to say is also a slot
 * a screen reader announces as an insertion.
 */
export function MessageSlot({ message }: { message: Message | null }) {
  const tone = message ? ` msg--${message.tone}` : '';

  return (
    <div className={`msg${tone}`} aria-live="polite">
      {message ? (
        <>
          <MessageIcon icon={message.icon} />
          <span>
            <b>{message.lead}</b>
            {message.rest ? ` ${message.rest}` : null}
          </span>
        </>
      ) : null}
    </div>
  );
}

function MessageIcon({ icon }: { icon: Message['icon'] }) {
  const size = 15;
  switch (icon) {
    case 'clock':
      return <IconClock size={size} />;
    case 'lock':
      return <IconLock size={size} />;
    case 'check':
      return <IconCheck size={size} />;
    default:
      return <IconWarn size={size} />;
  }
}
