import { useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { useT } from '../../../prefs.jsx';

/** Inline-SVG QR of an existing URL (no network, no canvas). */
export function QrCode({ value, size = 168, className = '' }) {
  const path = useMemo(() => {
    if (!value) return null;
    try {
      const qr = qrcode(0, 'M');
      qr.addData(String(value));
      qr.make();
      const n = qr.getModuleCount();
      let d = '';
      for (let r = 0; r < n; r += 1) {
        for (let c = 0; c < n; c += 1) {
          if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
        }
      }
      return { d, n };
    } catch {
      return null;
    }
  }, [value]);
  if (!path) return null;
  const quiet = 2;
  const box = path.n + quiet * 2;
  return (
    <svg
      className={`se-qr-svg ${className}`.trim()}
      viewBox={`${-quiet} ${-quiet} ${box} ${box}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={value}
    >
      <rect x={-quiet} y={-quiet} width={box} height={box} className="se-qr-bg" />
      <path d={path.d} className="se-qr-fg" />
    </svg>
  );
}

/** QR card used by the invite modal and the invite page. */
export function QrInviteCard({ link }) {
  const t = useT();
  if (!link) return null;
  return (
    <div className="se-qr-card">
      <div className="se-qr-frame"><QrCode value={link} size={148} /></div>
      <div className="se-qr-copy">
        <span className="se-qr-title">{t('seGroup.qrTitle')}</span>
        <span className="se-qr-hint">{t('seGroup.qrHint')}</span>
      </div>
    </div>
  );
}
