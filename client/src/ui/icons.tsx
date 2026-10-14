// Hand-drawn-feeling line icons (stroke = currentColor).
import type { JSX } from 'preact';

type P = { size?: number; class?: string };

function S(props: P & { children: JSX.Element | JSX.Element[] }) {
  const s = props.size ?? 22;
  return (
    <svg class={props.class} width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {props.children}
    </svg>
  );
}

export const IPaw = (p: P) => (
  <S {...p}>
    <ellipse cx="12" cy="15.5" rx="4.5" ry="3.8" />
    <circle cx="6.5" cy="10" r="1.8" />
    <circle cx="10" cy="6.5" r="1.8" />
    <circle cx="14" cy="6.5" r="1.8" />
    <circle cx="17.5" cy="10" r="1.8" />
  </S>
);
export const IFish = (p: P) => (
  <S {...p}>
    <path d="M3 12c3-4 8-5 12-2l5-3v10l-5-3c-4 3-9 2-12-2z" />
    <circle cx="8" cy="11" r=".6" fill="currentColor" />
  </S>
);
export const IMail = (p: P) => (
  <S {...p}>
    <rect x="3.5" y="6" width="17" height="12" rx="2" />
    <path d="M4 7l8 6 8-6" />
  </S>
);
export const IMenu = (p: P) => (
  <S {...p}>
    <path d="M5 7h14M5 12h14M5 17h14" />
  </S>
);
export const IHand = (p: P) => (
  <S {...p}>
    <path d="M8 13V6.5a1.5 1.5 0 013 0V12m0-6.5a1.5 1.5 0 013 0V12m0-5a1.5 1.5 0 013 0v7c0 4-2.5 6.5-6 6.5-2.5 0-4-1-5.5-3L4 13.5c-.7-1 .6-2.3 1.6-1.6L8 14" />
  </S>
);
export const IBowl = (p: P) => (
  <S {...p}>
    <path d="M3.5 12h17c0 4-3.8 7-8.5 7s-8.5-3-8.5-7z" />
    <path d="M9 9c1-1 2-1 3 0s2 1 3 0" />
  </S>
);
export const IFeather = (p: P) => (
  <S {...p}>
    <path d="M20 4c-7 0-12 5-12 12v4" />
    <path d="M20 4c0 6-4 11-12 12" />
    <path d="M10 13l4-1M12 10l4-1" />
  </S>
);
export const ICall = (p: P) => (
  <S {...p}>
    <path d="M4 10a8 8 0 0116 0v1a3 3 0 01-3 3h-1" />
    <path d="M8 14l-2 5M12 15v5M16 14l2 5" />
  </S>
);
export const IBrush = (p: P) => (
  <S {...p}>
    <path d="M14 4l6 6-8 8H6v-6z" />
    <path d="M11 7l6 6" />
  </S>
);
export const IDoor = (p: P) => (
  <S {...p}>
    <path d="M6 20V5a1 1 0 011-1h10a1 1 0 011 1v15" />
    <path d="M3 20h18" />
    <circle cx="14.5" cy="12.5" r=".8" fill="currentColor" />
  </S>
);
export const IHome = (p: P) => (
  <S {...p}>
    <path d="M4 11l8-7 8 7" />
    <path d="M6 10v10h12V10" />
    <path d="M10 20v-5h4v5" />
  </S>
);
export const IMap = (p: P) => (
  <S {...p}>
    <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
    <path d="M9 4v14M15 6v14" />
  </S>
);
export const IBag = (p: P) => (
  <S {...p}>
    <path d="M5 8h14l-1 12H6z" />
    <path d="M9 8a3 3 0 016 0" />
  </S>
);
export const IShirt = (p: P) => (
  <S {...p}>
    <path d="M8 4l-5 3 2 4 3-1v10h8V10l3 1 2-4-5-3c0 2-2 3-4 3S8 6 8 4z" />
  </S>
);
export const IBook = (p: P) => (
  <S {...p}>
    <path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z" />
    <path d="M12 6v14" />
  </S>
);
export const IStar = (p: P) => (
  <S {...p}>
    <path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />
  </S>
);
export const IGear = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
  </S>
);
export const IPeople = (p: P) => (
  <S {...p}>
    <circle cx="9" cy="9" r="3" />
    <circle cx="17" cy="10" r="2.5" />
    <path d="M3.5 19c.5-3 2.8-5 5.5-5s5 2 5.5 5M14 15c2.5-.5 5.5.8 6.5 4" />
  </S>
);
export const IChat = (p: P) => (
  <S {...p}>
    <path d="M4 6h16v10H10l-4 4v-4H4z" />
    <path d="M8 11h.01M12 11h.01M16 11h.01" />
  </S>
);
export const IPlus = (p: P) => (
  <S {...p}>
    <path d="M12 5v14M5 12h14" />
  </S>
);
export const IMinus = (p: P) => (
  <S {...p}>
    <path d="M5 12h14" />
  </S>
);
export const ITarget = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </S>
);
export const IClose = (p: P) => (
  <S {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </S>
);
export const IHeart = (p: P) => (
  <S {...p}>
    <path d="M12 19s-7-4.5-7-9.5A4 4 0 0112 7a4 4 0 017 2.5C19 14.5 12 19 12 19z" />
  </S>
);
export const IJoy = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" fill="currentColor" />
  </S>
);
export const IFlip = (p: P) => (
  <S {...p}>
    <path d="M12 3v18" stroke-dasharray="2 2.5" />
    <path d="M9 7L4 17h5zM15 7l5 10h-5z" />
  </S>
);
export const IBox = (p: P) => (
  <S {...p}>
    <path d="M4 8l8-4 8 4v9l-8 4-8-4z" />
    <path d="M4 8l8 4 8-4M12 12v9" />
  </S>
);
export const ICheck = (p: P) => (
  <S {...p}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </S>
);
export const ISend = (p: P) => (
  <S {...p}>
    <path d="M4 12l16-7-6 16-3-6z" />
    <path d="M11 15l9-10" />
  </S>
);
export const ISparkle = (p: P) => (
  <S {...p}>
    <path d="M12 3c.6 4 1.5 5 5 6-3.5 1-4.4 2-5 6-.6-4-1.5-5-5-6 3.5-1 4.4-2 5-6z" />
    <path d="M19 15c.3 1.6.7 2 2 2.5-1.3.4-1.7.9-2 2.5-.3-1.6-.7-2-2-2.5 1.3-.5 1.7-.9 2-2.5z" />
  </S>
);
export const IMoon = (p: P) => (
  <S {...p}>
    <path d="M19 14.5A7.5 7.5 0 019.5 5 7.5 7.5 0 1019 14.5z" />
  </S>
);
export const ISun = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </S>
);
export const ICloud = (p: P) => (
  <S {...p}>
    <path d="M7 18h10a4 4 0 000-8 5.5 5.5 0 00-10.5 1.5A3.3 3.3 0 007 18z" />
  </S>
);
export const IRain = (p: P) => (
  <S {...p}>
    <path d="M7 14h10a4 4 0 000-8 5.5 5.5 0 00-10.5 1.5A3.3 3.3 0 007 14z" />
    <path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3" />
  </S>
);
export const ISnow = (p: P) => (
  <S {...p}>
    <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
  </S>
);
export const ICamera = (p: P) => (
  <S {...p}>
    <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </S>
);
export const IDownload = (p: P) => (
  <S {...p}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </S>
);
