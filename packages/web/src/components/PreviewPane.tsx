import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from 'cn';
import { BatteryFull, Signal, Wifi, Smartphone, Tablet, Monitor, type LucideIcon } from 'lucide-react';
import { TooltipHint } from '@/components/ui/tooltip';
import { extractTitle, stripFirstH1 } from '@/core/markdown/markdown';
import type { ScrollSyncChannel } from '@/core/editor/scrollSync';
import type { Theme } from '@/core/theme/theme';

interface Props {
  body: string;
  theme: Theme;
  /**
   * Layout-change signal (editor width and mode switching both change it):
   * a backstop for the ResizeObserver — dragging the splitter or switching
   * between side-by-side and preview forces the stage to be re-measured.
   */
  resizeKey: string;
  /** Scroll-sync channel (the editor publishes, this subscribes and writes DOM) */
  sync: ScrollSyncChannel;
}

interface Anchor {
  line: number;
  top: number;
}

/** Tail blend range: the last stretch of editor travel used to converge
 *  smoothly onto the bottom of the preview */
const TAIL_BLEND = 0.18;

/**
 * What the preview is drawn as — always exactly what was picked, whatever the
 * pane's width:
 * - phone: the phone frame
 * - pad: a foldable's inner screen, held landscape
 * - desktop: a macOS window, for judging the wide measure
 */
type PreviewDevice = 'phone' | 'pad' | 'desktop';

const DEVICES: { id: PreviewDevice; name: string; icon: LucideIcon }[] = [
  { id: 'phone', name: '手机', icon: Smartphone },
  { id: 'pad', name: '平板', icon: Tablet },
  { id: 'desktop', name: '桌面', icon: Monitor },
];

/** Unzoomed frame size of the pad view; keep in step with the
 *  [data-device='pad'] .phone-frame rules in styles/preview.css */
const PAD_FRAME = { width: 842, height: 599 };

/** The stage's content box, which the pad view fits into */
function measure(stage: HTMLElement | null) {
  let w = 0;
  let h = 0;
  if (stage) {
    const cs = getComputedStyle(stage);
    // Floored so sub-pixel jitter while dragging doesn't re-render every frame
    w = Math.floor(stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    h = Math.floor(stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom));
  }
  return { w, h };
}

/** Zoom that fits the pad view into the stage, keeping its real proportions (1 = real size) */
function fitFor(device: PreviewDevice, w: number, h: number): number {
  if (device !== 'pad' || w <= 0 || h <= 0) return 1;
  return Math.max(0.3, Math.round(Math.min(1, w / PAD_FRAME.width, h / PAD_FRAME.height) * 1000) / 1000);
}

/**
 * Convert a source position into a preview scroll offset.
 *
 * The point is interpolation, not snapping: find the two anchors the position
 * falls between and take a linear value between their offsets, in proportion to
 * the line number. Snapping to the nearest anchor makes the preview jump a
 * paragraph at a time — that was the old stutter. Interpolated, the preview
 * follows the editor continuously.
 */
function offsetForPosition(anchors: Anchor[], position: number, end: Anchor | null): number {
  // Binary search for the last anchor with line <= position
  let lo = 0;
  let hi = anchors.length - 1;
  let i = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid].line <= position) {
      i = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (i < 0) {
    // The position sits above the first anchor (the preview drops the duplicate
    // h1, so the opening lines have no anchor of their own): interpolate from a
    // virtual "top of content" to the first anchor, otherwise reaching it jumps
    // a long way at once
    const first = anchors[0];
    if (first.line <= 0) return 0;
    return Math.max(0, first.top * Math.min(1, Math.max(0, position / first.line)));
  }
  const cur = anchors[i];
  // Past the last anchor, attach a virtual "end of article" anchor so the tail
  // keeps interpolating instead of freezing and then jumping
  const next = anchors[i + 1] ?? (end && end.line > cur.line ? end : null);
  if (!next) return Math.max(0, cur.top);
  const span = next.line - cur.line;
  if (span <= 0) return Math.max(0, cur.top);
  const t = Math.min(1, Math.max(0, (position - cur.line) / span));
  return Math.max(0, cur.top + (next.top - cur.top) * t);
}

/**
 * Build the "source line → preview offset" anchor table.
 * `top` is relative to the top of the scrolled content (it excludes the current
 * scrollTop), so it can be reused while scrolling and only needs rebuilding
 * after the body or the layout changes.
 */
function buildAnchors(scroll: HTMLElement): Anchor[] {
  // Read every geometry value in one pass without writing DOM in between, so
  // the browser is forced through a single reflow
  const box = scroll.getBoundingClientRect();
  // Rects are in visual pixels, scrollTop in the scroller's own layout pixels.
  // They differ by every zoom above the scroller (0.92 on the phone screen,
  // times the fit-to-pane zoom of the pad view), and engines disagree on
  // whether rects include zoom at all — so measure the ratio, don't assume it.
  const k = scroll.offsetHeight > 0 ? box.height / scroll.offsetHeight : 1;
  const anchors: Anchor[] = [];
  for (const el of scroll.querySelectorAll<HTMLElement>('[data-line]')) {
    const line = Number(el.dataset.line);
    if (anchors.length && anchors[anchors.length - 1].line === line) continue;
    anchors.push({ line, top: (el.getBoundingClientRect().top - box.top) / k + scroll.scrollTop });
  }
  return anchors;
}

/**
 * The right-hand preview, drawn as the chosen device (see PreviewDevice):
 * - the pad view keeps its real proportions and zooms to fit the pane
 * - desktop is a macOS window with a traffic-light title bar
 * - article head on top (title plus byline), action bar at the end of the content
 * Every style in the body HTML is inline ⇒ preview and export (the WeChat
 * paste) are identical.
 */
export default function PreviewPane({ body, theme, resizeKey, sync }: Props) {
  const paneRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  /** Content box of the device stage, for fitting the pad view */
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [device, setDevice] = useState<PreviewDevice>('phone');
  /** What actually gets drawn */
  const layout = device === 'desktop' ? 'desktop' : 'phone';
  const fit = fitFor(device, stage.w, stage.h);
  const title = useMemo(() => extractTitle(body), [body]);
  /** Body used for the preview (duplicate h1 removed; exports still use the full body) */
  const previewBody = useMemo(() => (title ? stripFirstH1(body) : body), [body, title]);
  /** Date in the article head (a new Date() on every render means nothing) */
  const today = useMemo(() => new Date(), []);

  // Track the stage size as the pane resizes, for fitting the pad view
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const update = () => {
      const m = measure(stageRef.current);
      setStage((prev) => (prev.w === m.w && prev.h === m.h ? prev : m));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(pane);
    return () => ro.disconnect();
  }, []);

  // Backstop refresh on a layout change (drag, mode switch)
  useEffect(() => {
    const m = measure(stageRef.current);
    setStage((prev) => (prev.w === m.w && prev.h === m.h ? prev : m));
  }, [resizeKey]);

  /** Anchor cache (null means it needs rebuilding) */
  const anchorsRef = useRef<Anchor[] | null>(null);
  /** Request one sync (coalesced onto a rAF); reused when the body changes */
  const scheduleRef = useRef<() => void>(() => {});

  // Editor scroll → preview scroll. None of this path goes through React:
  // subscribe to the channel → coalesce onto a frame → interpolate the anchors
  // → write scrollTop.
  useEffect(() => {
    const apply = () => {
      const scroll = scrollRef.current;
      if (!scroll) return;
      const { position, endPosition, atTop, atBottom } = sync.state;
      // Align the edges exactly, so interpolation error leaves no gap at either
      // end. Snapping at the bottom is now "the interpolation had already
      // converged there", not a jump.
      if (atBottom) {
        scroll.scrollTop = scroll.scrollHeight;
        return;
      }
      if (atTop) {
        if (scroll.scrollTop !== 0) scroll.scrollTop = 0;
        return;
      }
      let anchors = anchorsRef.current;
      if (!anchors) {
        anchors = buildAnchors(scroll);
        anchorsRef.current = anchors;
      }
      if (!anchors.length) return;
      const maxScroll = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
      const end = endPosition > 0 ? { line: endPosition, top: maxScroll } : null;
      let top = offsetForPosition(anchors, position, end);

      // Landing alignment: when the editor hits its bottom, the topmost visible
      // line is still mid-document, and the anchor-derived position falls short
      // of the preview's bottom. That gap used to be closed by "at the bottom,
      // jump to the bottom", which is why the ending lurched. Now it converges
      // over the final stretch instead.
      if (endPosition > 0) {
        const t = Math.min(1, Math.max(0, position / endPosition));
        if (t > 1 - TAIL_BLEND) {
          const w = (t - (1 - TAIL_BLEND)) / TAIL_BLEND;
          const eased = w * w * (3 - 2 * w); // smoothstep: no kink on entering the blend
          top = top + (maxScroll - top) * eased;
        }
      }
      if (Math.abs(scroll.scrollTop - top) < 0.5) return;
      scroll.scrollTop = top;
    };

    let raf = 0;
    const schedule = () => {
      // Collapse several scroll events in one frame into a single read/write
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        apply();
      });
    };
    scheduleRef.current = schedule;
    const unsubscribe = sync.subscribe(schedule);
    schedule();
    return () => {
      unsubscribe();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [sync]);

  // A re-rendered body, a device switch or a refit invalidates every anchor
  // offset, and calls for one realignment
  useEffect(() => {
    anchorsRef.current = null;
    scheduleRef.current();
  }, [body, device, fit]);

  // Async height changes — image decoding, font loading — invalidate them too
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      anchorsRef.current = null;
      scheduleRef.current();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Follow the article theme in the status bar and desktop window chrome
  useEffect(() => {
    document.documentElement.style.setProperty('--art-accent', theme.accent);
    document.documentElement.style.setProperty('--art-heading', theme.heading.color);
    document.documentElement.style.setProperty('--art-ink', theme.body.color);
    document.documentElement.style.setProperty('--art-hr', theme.hr.color);
    document.documentElement.style.setProperty('--art-foot-text', theme.footnote.textColor);
    document.documentElement.style.setProperty('--art-bg', theme.body.bg ?? '#ffffff');
    document.documentElement.style.setProperty('--art-heading-font', theme.heading.font);
    return () => {
      document.documentElement.style.removeProperty('--art-accent');
      document.documentElement.style.removeProperty('--art-heading');
      document.documentElement.style.removeProperty('--art-ink');
      document.documentElement.style.removeProperty('--art-hr');
      document.documentElement.style.removeProperty('--art-foot-text');
      document.documentElement.style.removeProperty('--art-bg');
      document.documentElement.style.removeProperty('--art-heading-font');
    };
  }, [theme]);

  return (
    <section
      className="split-pane preview-side"
      ref={paneRef}
      data-width={layout}
      data-device={device}
      // The web build has no shell dark mode: the paper decides, so a dark
      // theme gets the Night Sky pad and a light one Star White
      data-appearance={theme.appearance}
    >
      <div className="preview-toolbar">
        <div className="inline-grid grid-cols-3 bg-[rgba(60,54,44,0.055)] rounded-lg p-0.5 gap-px" role="radiogroup" aria-label="预览机型">
          {DEVICES.map((d) => {
            const Icon = d.icon;
            return (
              <TooltipHint key={d.id} content={d.name}>
                <button
                  role="radio"
                  aria-checked={device === d.id}
                  className={cn(
                    'border-none bg-transparent px-2 py-1.5 rounded-md cursor-pointer text-muted-foreground flex items-center justify-center transition-colors duration-[160ms] ease-[var(--ease)] hover:text-foreground',
                    device === d.id && 'bg-[var(--panel-solid)] text-foreground',
                  )}
                  onClick={() => setDevice(d.id)}
                >
                  <Icon size={16} />
                </button>
              </TooltipHint>
            );
          })}
        </div>
      </div>
      <div className="phone-stage" ref={stageRef}>
        <div className="phone-frame" style={device === 'pad' ? { zoom: fit } : undefined}>
          {/* Side buttons (phone mode): on the phone, action and volume left,
              power right; the pad moves them to where its edges carry them */}
          <span className="side-btn action" aria-hidden="true"></span>
          <span className="side-btn vol-up" aria-hidden="true"></span>
          <span className="side-btn vol-down" aria-hidden="true"></span>
          <span className="side-btn power" aria-hidden="true"></span>
          <div className="phone-screen">
            {/* macOS window title bar (desktop mode) */}
            <div className="desktop-bar">
              <span className="traffic t1"></span>
              <span className="traffic t2"></span>
              <span className="traffic t3"></span>
              <span className="bar-title">文章预览 · {theme.name}</span>
            </div>
            {/* Phone status bar: Dynamic Island centered, real status icons on
                either side. The pad has no bar: the time and one status ring
                (Wi-Fi inside, signal as dots) stack in the top-right corner. */}
            <div className="statusbar">
              <span className="time">9:41</span>
              <span className="dynamic-island" aria-hidden="true"></span>
              <span className="sb-icons" aria-hidden="true">
                <Signal size={13} fill="currentColor" />
                <Wifi size={13} />
                <BatteryFull size={17} fill="currentColor" />
              </span>
            </div>
            <div className="article-scroll" ref={scrollRef}>
              {/* WeChat article head: title (with a placeholder when empty) plus byline */}
              <div className="article-head">
                <h1 className="head-title">{title || '未命名文章'}</h1>
                <div className="meta">
                  <span className="author">稿域</span>
                  <span className="byline">
                    {today.getFullYear()} 年 {today.getMonth() + 1} 月 {today.getDate()} 日
                  </span>
                </div>
              </div>
              <div
                className="check-body"
                ref={bodyRef}
                dangerouslySetInnerHTML={{ __html: previewBody }}
              />
            </div>
            {/* Home indicator (phone mode) */}
            <span className="home-indicator" aria-hidden="true"></span>
          </div>
        </div>
      </div>
    </section>
  );
}
