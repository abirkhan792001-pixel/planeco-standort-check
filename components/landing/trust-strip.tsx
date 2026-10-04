import Image from 'next/image';
import { softShadow } from '@/components/form-ui';

/**
 * Planeco-style bottom panel (spec §9). Two of Planeco's claims verbatim; the callback item matches this page's
 * next-working-day promise instead of Planeco's "< 24 h". Icons are Planeco's, decorative.
 */
const ITEMS = [
  { text: '+ 10 Experten vor Ort', icon: '/brand/icon-experts.png', width: 44, height: 57 },
  { text: 'Rückruf am nächsten Werktag', icon: '/brand/icon-callback.png', width: 44, height: 52 },
  { text: '+ 15 Jahre Erfahrung', icon: '/brand/icon-experience.png', width: 44, height: 46 },
] as const;

export function TrustStrip() {
  return (
    <section aria-label="Ihre Vorteile" className="px-4 pb-8 sm:px-6">
      <ul className={`mx-auto grid max-w-6xl gap-6 rounded-[2rem] bg-paper px-8 py-8 md:grid-cols-3 md:px-12 ${softShadow}`}>
        {ITEMS.map((item) => (
          <li key={item.text} className="flex items-center justify-center gap-5 text-base md:text-lg">
            <Image src={item.icon} alt="" width={item.width} height={item.height} unoptimized className="shrink-0" />
            {item.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
