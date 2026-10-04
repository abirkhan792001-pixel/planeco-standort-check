import Image from 'next/image';
import { softShadow } from '@/components/form-ui';

/** Planeco's P mark (public/brand/planeco-mark.png, 4x of its display size). Decorative: the wordmark text names the brand. */
export function PlanecoMark({ className = '' }: { className?: string }) {
  return <Image src="/brand/planeco-mark.png" alt="" width={348} height={388} unoptimized priority className={className} />;
}

/** The round white logo badge above the form, as on Planeco's Heyflow form. */
export function LogoBadge() {
  return (
    <div className={`mx-auto mb-8 grid size-24 place-items-center rounded-full bg-white ${softShadow}`}>
      <PlanecoMark className="h-12 w-auto" />
    </div>
  );
}

const BADGES = [
  { src: '/brand/google-rating.png', alt: 'Google-Bewertungen: 5 Sterne', width: 125, height: 37 },
  { src: '/brand/dgnb.png', alt: 'Mitglied der DGNB', width: 193, height: 65 },
  { src: '/brand/das-handwerk.png', alt: 'Das Handwerk – Die Wirtschaftsmacht von nebenan', width: 214, height: 46 },
] as const;

/** Planeco's trust badges, shown at their native size (cropped from planeco's site). */
export function TrustBadges() {
  return (
    <ul aria-label="Bewertungen und Mitgliedschaften" className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
      {BADGES.map((b) => (
        <li key={b.src}>
          <Image src={b.src} alt={b.alt} width={b.width} height={b.height} unoptimized />
        </li>
      ))}
    </ul>
  );
}
