import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (p: P): P => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  ...p,
});

/** 카카오 말풍선 (카카오로 시작하기 버튼용, 채움) */
export const IconKakao = (p: P) => (
  <svg {...base({ width: 18, height: 18, fill: "currentColor", stroke: "none", ...p })}>
    <path d="M12 3C6.5 3 2 6.5 2 10.8c0 2.7 1.8 5.1 4.5 6.5l-1 3.7c-.1.3.2.5.5.4l4.4-2.9c.5.1 1 .1 1.6.1 5.5 0 10-3.5 10-7.8S17.5 3 12 3Z" />
  </svg>
);
export const IconSun = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
export const IconPen = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
export const IconNote = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 3h9l5 5v13H6Z" />
    <path d="M15 3v5h5M9 13h6M9 17h6" />
  </svg>
);
export const IconFlag = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 21V4" />
    <path d="M5 4h12l-2 4 2 4H5" />
  </svg>
);
export const IconCalendar = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);
export const IconPlus = (p: P) => (
  <svg {...base({ strokeWidth: 2.4, ...p })}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
/** 새 글 (인스타그램 상단의 네모 안 더하기) */
export const IconSquarePlus = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    <path d="M12 8.5v7M8.5 12h7" />
  </svg>
);
/** 사진 추가 */
export const IconImage = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m20.5 16-4.6-4.6a1.5 1.5 0 0 0-2.1 0L6 19.5" />
  </svg>
);
export const IconCheck = (p: P) => (
  <svg {...base({ strokeWidth: 3, ...p })}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const IconTrash = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);
export const IconPin = (p: P) => (
  <svg {...base({ fill: "currentColor", stroke: "none", ...p })}>
    <path d="M14.5 2.5 21.5 9.5l-2.2.7-3.1 3.1.4 4.1-2 2-4.3-4.3L5 20.4 3.6 19l5.3-5.3L4.6 9.4l2-2 4.1.4 3.1-3.1z" />
  </svg>
);
export const IconChevronL = (p: P) => (
  <svg {...base(p)}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
export const IconChevronR = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);
export const IconSparkle = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" />
    <path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z" />
  </svg>
);
export const IconRefresh = (p: P) => (
  <svg {...base(p)}>
    <path d="M20 12a8 8 0 1 1-2.3-5.7" />
    <path d="M20 4v5h-5" />
  </svg>
);
export const IconChart = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 20V4M4 20h16" />
    <path d="M7 15l4-5 3 3 5-7" />
  </svg>
);
export const IconMegaphone = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 10v4a1 1 0 0 0 1 1h3l7 4V5L7 9H4a1 1 0 0 0-1 1Z" />
    <path d="M17 9.5a3.5 3.5 0 0 1 0 5M8 15l1.5 5h3" />
  </svg>
);
export const IconShield = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6Z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
export const IconMessage = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4V6Z" />
  </svg>
);
export const IconSend = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 3 10 14M21 3l-7 18-4-7-7-4Z" />
  </svg>
);
export const IconClose = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const IconReels = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="3" width="16" height="18" rx="3" />
    <path d="M4 8h16M10 12l4 2.5-4 2.5z" />
  </svg>
);
export const IconUser = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);
export const IconTrophy = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 4h10v4a5 5 0 0 1-10 0Z" />
    <path d="M7 6H4a3 3 0 0 0 3 3M17 6h3a3 3 0 0 1-3 3M12 13v4M8 21h8M9 17h6" />
  </svg>
);
export const IconCoin = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" />
  </svg>
);
export const IconHeart = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
  </svg>
);
export const IconStar = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z" />
  </svg>
);
export const IconSettings = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);
export const IconMore = (p: P) => (
  <svg {...base({ fill: "currentColor", stroke: "none", ...p })}>
    <circle cx="6" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="18" cy="12" r="1.8" />
  </svg>
);
/** 동그란 말풍선 (외침 탭 · 위로 댓글) */
export const IconBubble = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5a8.5 8.5 0 0 1 0 17 9 9 0 0 1-3.9-.9L4 20.5l.9-3.6A8.5 8.5 0 0 1 12 3.5Z" />
  </svg>
);
export const IconBookmark = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 4.5h12v16l-6-4.2-6 4.2Z" />
  </svg>
);

/* ---------- 카테고리·상태용 추가 아이콘 (같은 선 두께) ---------- */
export const IconSmile = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 10h.01M15 10h.01" />
  </svg>
);
export const IconMoon = (p: P) => (
  <svg {...base(p)}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
  </svg>
);
export const IconUsers = (p: P) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    <path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20c0-3-2-5.2-4.8-5.8" />
  </svg>
);
export const IconBriefcase = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="7" width="18" height="13" rx="3" />
    <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" />
  </svg>
);
export const IconLeaf = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 19C5 10 10 5 20 4c0 10-5 15-14 15Z" />
    <path d="M5 19c3-4 6-7 10-10" />
  </svg>
);
export const IconTag = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 12V4h8l10 10-8 8L3 12Z" />
    <circle cx="8" cy="9" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);
export const IconBook = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" />
    <path d="M4 19a2 2 0 0 1 2-2h13M8 7h7" />
  </svg>
);
export const IconPalette = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2v-1a2 2 0 0 1 2-2h1.5c1.5 0 2.5-1 2.5-3 0-5-3.8-10-8-10Z" />
    <circle cx="8" cy="10" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="16" cy="10" r="1" fill="currentColor" stroke="none" />
  </svg>
);
export const IconRun = (p: P) => (
  <svg {...base(p)}>
    <circle cx="15" cy="4.5" r="1.8" />
    <path d="M5 21l3.5-6 3-1.5 2 2.5 4 1M9 10l3.5-1 4 1.5 2.5 2.5M12.5 9 9 10l-2 3" />
  </svg>
);
export const IconLotus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 20c-3-2-4-6-4-10 2 1 3 3 4 5 1-2 2-4 4-5 0 4-1 8-4 10Z" />
    <path d="M12 20c-5 0-8-2.5-9-6 3 0 5 1 7 3M12 20c5 0 8-2.5 9-6-3 0-5 1-7 3" />
  </svg>
);
export const IconGamepad = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 8h10a5 5 0 0 1 5 5v1a3 3 0 0 1-5.2 2L15 14H9l-1.8 2A3 3 0 0 1 2 14v-1a5 5 0 0 1 5-5Z" />
    <path d="M7 11v3M5.5 12.5h3M15.5 11.5h.01M17.5 13.5h.01" />
  </svg>
);
export const IconClover = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="7" r="3" />
    <circle cx="7.5" cy="12.5" r="3" />
    <circle cx="16.5" cy="12.5" r="3" />
    <path d="M12 15.5V21M12 15.5c-1 1.5-2.5 2.5-4.5 3" />
  </svg>
);
export const IconPlane = (p: P) => (
  <svg {...base(p)}>
    <path d="M10.5 13.5 3 11l1-2 7.5 1.5L17 5l2.5 1-3.5 7 3 3-1 1.5-4-1.5-3 3.5H9l1.5-6Z" />
  </svg>
);
export const IconPaw = (p: P) => (
  <svg {...base(p)}>
    <circle cx="7" cy="9" r="1.8" />
    <circle cx="17" cy="9" r="1.8" />
    <circle cx="10" cy="5.5" r="1.8" />
    <circle cx="14" cy="5.5" r="1.8" />
    <path d="M12 11c-3 0-5.5 2.5-5.5 5 0 1.7 1.2 3 3 3 .9 0 1.6-.4 2.5-.4s1.6.4 2.5.4c1.8 0 3-1.3 3-3 0-2.5-2.5-5-5.5-5Z" />
  </svg>
);
export const IconCoffee = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9Z" />
    <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M7 3.5v2M10 3.5v2M13 3.5v2" />
  </svg>
);
export const IconMusic = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="17.5" cy="16" r="2.5" />
  </svg>
);
export const IconTool = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 6.5a5 5 0 0 1-6.8 6.4L6 21l-3-3 8.1-8.2A5 5 0 0 1 17.5 3l-3 3 3.5 3.5 3-3Z" />
  </svg>
);
export const IconRain = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 15a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.3 1.5A3.8 3.8 0 0 1 17.5 15H7Z" />
    <path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" />
  </svg>
);
export const IconBubbles = (p: P) => (
  <svg {...base(p)}>
    <circle cx="9" cy="14" r="5" />
    <circle cx="17" cy="7" r="3" />
    <circle cx="17.5" cy="16.5" r="1.5" />
  </svg>
);
export const IconCloudOff = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 18a4.5 4.5 0 0 1-1.5-8.7A6 6 0 0 1 16 6.5M19.5 11.5A3.8 3.8 0 0 1 17.5 18H9" />
    <path d="M3 3l18 18" />
  </svg>
);
export const IconAlert = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5M12 16h.01" />
  </svg>
);
export const IconLock = (p: P) => (
  <svg {...base(p)}>
    <rect x="5" y="10" width="14" height="11" rx="3" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14.5v2.5" />
  </svg>
);
export const IconInbox = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 4h16v16H4Z" />
    <path d="M4 14h4.5l1.5 2.5h4l1.5-2.5H20" />
  </svg>
);
export const IconClock = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </svg>
);
export const IconFilm = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
  </svg>
);
/** 선으로 그린 주먹 (힘내요 숫자 옆 표시용). 켜진 상태의 3D 주먹은 Fist3D */
export const IconFist = (p: P) => (
  <svg {...base({ strokeWidth: 1.8, ...p })}>
    <path d="M6 11V8.5a1.5 1.5 0 0 1 3 0V11M9 11V7.5a1.5 1.5 0 0 1 3 0V11M12 11V7.5a1.5 1.5 0 0 1 3 0V11M15 11V8.5a1.5 1.5 0 0 1 3 0V11" />
    <path d="M6 11h12v4.5A5.5 5.5 0 0 1 12.5 21h-1A5.5 5.5 0 0 1 6 15.5Z" />
    <path d="M8 13.3h3.5a1.6 1.6 0 0 1 0 3.2H8a1.6 1.6 0 0 1 0-3.2Z" />
  </svg>
);
