import { byId } from '../../../registry';
import { QrCode } from '../../../ui/QrCode';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { SpecTable } from '../../chrome/Docs';

/** QR code — written 21 Nov 2026 for the client's Pay with UPI on a desk. The specimen encodes a sample UPI link. */
export function QrCodeEntry() {
  const entry = byId('c-qrcode')!;
  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/QrCode.tsx</code> },
        { k: 'Class', v: <code>.qr</code> },
        { k: 'Element', v: <><code>&lt;svg role=&quot;img&quot;&gt;</code>, one path</> },
        { k: 'Used in', v: '/me/today (desk)' },
      ]}
    >
      <Blk title="Specimen" lede={<>A sample UPI payment link. Point a phone&rsquo;s camera at it: it names a made-up payee and amount.</>}>
        <Bench>
          <Cell label="a UPI link, 176px" center>
            <QrCode value="upi://pay?pa=sample@upi&pn=Sample&am=100.00&cu=INR" label="Sample UPI payment code" />
          </Cell>
        </Bench>
      </Blk>
      <Blk
        title="Black on white, in both themes"
        lede={<>Phone scanners read dark on light most reliably; an inverted code fails on a fair share of them. The white tile on the dark page is correct, not a theming miss. Use it for a link a phone should take from a desk screen; on a phone, give the link itself.</>}
      />
      <SpecTable
        rows={[
          { property: 'Error correction', value: 'M (15%)', token: undefined, note: 'Short links; readable through a smudge' },
          { property: 'Quiet zone', value: '4 modules', token: undefined, note: 'The standard; scanners need it' },
          { property: 'Size', value: '176px default', token: undefined, note: 'Scales; crisp edges' },
        ]}
      />
    </Cmp>
  );
}
