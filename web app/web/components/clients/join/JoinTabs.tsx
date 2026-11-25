import { PageTabs } from '@/components/shell/PageTabs';

/**
 * Clients' three pages (22 Nov 2026): the roster, everybody on their way IN — invitations out and join requests in, one list
 * since they answer one question — and the join link that brings the second kind. `joining` is the count of requests waiting
 * on the trainer's answer, the only thing in that tab nobody else can move; null draws no badge.
 */
export function ClientsTabs({ current, joining }: { current: 'clients' | 'joining' | 'link'; joining?: number | null }) {
  return (
    <PageTabs
      label="Clients"
      current={current}
      tabs={[
        { key: 'clients', label: 'Clients', href: '/clients' },
        { key: 'joining', label: 'Joining', href: '/clients/joining', count: joining || null },
        { key: 'link', label: 'Join link', href: '/clients/join-link' },
      ]}
    />
  );
}
