import { Button } from '@/web-components/ui/Button';
import { EmptyState } from '@/web-components/ui/EmptyState';

/**
 * A portal read that failed in a way the page says in its own words (a restarting server, a dropped connection — never a paused,
 * removed or signed-out client, which `settle` has already sent to their own screen).
 *
 * It was a bare amber `Message` saying *reload in a moment* on every tab, which hands the client a job and no control to do it with.
 * This is the same sentence with the control: *Try again* reloads the route it is on. Inside `.body` and `.portal`, so the failure sits
 * in the column the content would have.
 */
export function LoadFailed({ what, retryHref }: { what: string; retryHref: string }) {
  return (
    <div className="body">
      <div className="portal col gap4">
        <EmptyState
          title={`We couldn’t load ${what} just now`}
          body="Nothing has been lost. Give it a moment and try again."
          action={<Button variant="primary" href={retryHref}>Try again</Button>}
        />
      </div>
    </div>
  );
}
