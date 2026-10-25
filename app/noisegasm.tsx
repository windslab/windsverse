'use client';
// Noisegasm: background music for the landing page, played on a 3D toon gramophone.
//
// Plays uploaded songs (an <audio> element through a gain node, so the volume knob also works on
// iPhone) or a YouTube playlist (the official iframe player, kept visible in the mini player as
// YouTube requires). Browsers block sound until the visitor interacts, so if autoplay is refused
// the music starts on the first tap, click or key press anywhere on the page.
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import styles from './noisegasm.module.css';

const Gramophone3D = dynamic(() => import('./gramophone-3d'), {
  ssr: false,
  loading: () => <span className={styles.stageLoading}>Menyiapkan gramofon…</span>,
});

type Track = { id: string; title: string; artist: string; src: string };
type Config = { source: 'upload' | 'youtube'; youtube: string; autoplay: boolean; volume: number };

type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  nextVideo(): void;
  previousVideo(): void;
  setVolume(v: number): void;
  getVideoData(): { title?: string; author?: string };
  destroy(): void;
};
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    options: {
      width: number;
      height: number;
      videoId?: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
};
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let youtubeApi: Promise<YTNamespace> | undefined;
function loadYouTube() {
  youtubeApi ??= new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });
  return youtubeApi;
}

const PAUSED_KEY = 'noisegasm-paused',
  VOLUME_KEY = 'noisegasm-volume';
const session = {
  get(key: string) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      /* Optional. */
    }
  },
};

export default function Noisegasm({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [config, setConfig] = useState<Config | null>(null),
    [tracks, setTracks] = useState<Track[]>([]),
    [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [volume, setVolumeState] = useState(0.5),
    [nowPlaying, setNowPlaying] = useState({ title: '', artist: '' }),
    [waiting, setWaiting] = useState(false);
  const audio = useRef<HTMLAudioElement>(null),
    graph = useRef<{ ctx: AudioContext; gain: GainNode } | null>(null),
    yt = useRef<YTPlayer | null>(null),
    ytHost = useRef<HTMLDivElement>(null),
    wantPlay = useRef(false),
    volumeRef = useRef(0.5);
  const youtube = config?.source === 'youtube' && !!config.youtube;
  const hasMusic = youtube || tracks.length > 0;

  useEffect(() => {
    void fetch('/api/music', { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ config: Config; tracks: Track[] }>)
      .then((data) => {
        const saved = Number(session.get(VOLUME_KEY));
        const v = Number.isFinite(saved) && session.get(VOLUME_KEY) ? saved : data.config.volume;
        volumeRef.current = v;
        setVolumeState(v);
        setConfig(data.config);
        setTracks(data.tracks);
      })
      .catch(() => {});
  }, []);

  const applyVolume = useCallback((v: number) => {
    volumeRef.current = v;
    if (graph.current) graph.current.gain.gain.value = v;
    else if (audio.current) audio.current.volume = v;
    yt.current?.setVolume(Math.round(v * 100));
  }, []);
  const setVolume = (v: number) => {
    const next = Math.min(1, Math.max(0, v));
    setVolumeState(next);
    session.set(VOLUME_KEY, String(next));
    applyVolume(next);
  };

  /** Route the <audio> element through a gain node (needs a user gesture on iPhone). */
  const ensureGraph = () => {
    if (graph.current || !audio.current) return;
    try {
      const ctx = new AudioContext(),
        gain = ctx.createGain();
      ctx.createMediaElementSource(audio.current).connect(gain).connect(ctx.destination);
      gain.gain.value = volumeRef.current;
      audio.current.volume = 1;
      graph.current = { ctx, gain };
    } catch {
      /* Falls back to element volume. */
    }
  };

  const start = useCallback(async () => {
    wantPlay.current = true;
    if (youtube) {
      yt.current?.playVideo();
      return true;
    }
    const el = audio.current;
    if (!el || !el.src) return false;
    try {
      await graph.current?.ctx.resume();
      await el.play();
      return true;
    } catch {
      return false;
    }
  }, [youtube]);

  const pause = () => {
    wantPlay.current = false;
    session.set(PAUSED_KEY, '1');
    if (youtube) yt.current?.pauseVideo();
    else audio.current?.pause();
  };
  const toggle = () => {
    if (playing) return pause();
    session.set(PAUSED_KEY, '');
    ensureGraph();
    void start();
  };
  const step = (dir: 1 | -1) => {
    if (youtube) {
      if (dir > 0) yt.current?.nextVideo();
      else yt.current?.previousVideo();
      return;
    }
    if (!tracks.length) return;
    wantPlay.current = true;
    ensureGraph();
    setIndex((i) => (i + dir + tracks.length) % tracks.length);
  };

  // Uploaded songs: load the current track and keep playing if music was on.
  useEffect(() => {
    const el = audio.current,
      track = tracks[index];
    if (youtube || !el || !track) return;
    el.src = track.src;
    setNowPlaying({ title: track.title, artist: track.artist });
    if (wantPlay.current) void el.play().catch(() => {});
  }, [tracks, index, youtube]);

  // YouTube: build the official player once the playlist is known.
  useEffect(() => {
    if (!youtube || !config || !ytHost.current) return;
    let cancelled = false;
    const [kind, id] = config.youtube.split(':');
    void loadYouTube().then((YT) => {
      if (cancelled || !ytHost.current) return;
      const el = document.createElement('div');
      ytHost.current.replaceChildren(el);
      yt.current = new YT.Player(el, {
        width: 160,
        height: 90,
        videoId: kind === 'video' ? id : undefined,
        playerVars: {
          playsinline: 1,
          rel: 0,
          ...(kind === 'list' ? { listType: 'playlist', list: id } : { loop: 1, playlist: id }),
        },
        events: {
          onReady: () => {
            yt.current?.setVolume(Math.round(volumeRef.current * 100));
            if (wantPlay.current) yt.current?.playVideo();
          },
          onStateChange: (e) => {
            const data = yt.current?.getVideoData();
            if (data?.title) setNowPlaying({ title: data.title, artist: data.author ?? '' });
            if (e.data === YT.PlayerState.PLAYING) {
              setPlaying(true);
              setWaiting(false);
            } else if (e.data === YT.PlayerState.PAUSED) setPlaying(false);
          },
        },
      });
    });
    return () => {
      cancelled = true;
      yt.current?.destroy();
      yt.current = null;
    };
  }, [youtube, config]);

  // Autoplay: try right away; if the browser refuses, start on the first interaction.
  useEffect(() => {
    if (!config?.autoplay || !hasMusic || session.get(PAUSED_KEY)) return;
    let done = false;
    const begin = () => {
      if (done) return;
      done = true;
      remove();
      ensureGraph();
      void start();
    };
    const events = ['pointerdown', 'keydown', 'touchend'] as const;
    const remove = () => events.forEach((e) => window.removeEventListener(e, begin, true));
    wantPlay.current = true;
    if (!youtube)
      void start().then((ok) => {
        if (ok) {
          done = true;
          remove();
        } else setWaiting(true);
      });
    else setWaiting(true);
    events.forEach((e) => window.addEventListener(e, begin, { capture: true, passive: true }));
    return remove;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per loaded config
  }, [config, hasMusic]);

  if (!config || !hasMusic) return null;
  const title = nowPlaying.title || (youtube ? 'YouTube' : 'Noisegasm');

  return (
    <>
      <audio
        ref={audio}
        preload="none"
        onPlay={() => {
          setPlaying(true);
          setWaiting(false);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => step(1)}
        onVolumeChange={() => {}}
      />
      <div
        className={styles.mini + ' noisegasm-mini'}
        data-on={playing || undefined}
        data-youtube={youtube || undefined}
      >
        <div className={styles.miniVideo} ref={ytHost} hidden={!youtube} />
        <button className={styles.miniMain} onClick={() => onOpenChange(true)}>
          <span className={styles.bars} aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className={styles.miniText}>
            <small>NOISEGASM</small>
            <span>{waiting && !playing ? 'Ketuk di mana saja untuk musik' : title}</span>
          </span>
        </button>
        <button
          className={styles.miniToggle}
          aria-label={playing ? 'Jeda musik' : 'Putar musik'}
          onClick={toggle}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
      </div>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={styles.dialog}>
          <DialogTitle className="sr-only">Noisegasm</DialogTitle>
          <DialogDescription className="sr-only">
            Gramofon musik Winds Space. Atur volume, jeda, atau ganti lagu.
          </DialogDescription>
          <div className={styles.player} data-on={playing || undefined}>
            <div className={styles.stage}>
              <Gramophone3D playing={playing} />
            </div>
            <div className={styles.plaque} aria-live="polite">
              <small>NOISEGASM</small>
              <div className={styles.marquee}>
                <span data-scroll={title.length > 26 || undefined}>
                  {title}
                  {nowPlaying.artist ? ' — ' + nowPlaying.artist : ''}
                </span>
              </div>
            </div>
            <div className={styles.knobs}>
              <Knob value={volume} onChange={setVolume} label="VOLUME" />
              <div className={styles.keys}>
                <button aria-label="Lagu sebelumnya" onClick={() => step(-1)}>
                  <SkipBack size={16} />
                </button>
                <button
                  aria-label={playing ? 'Jeda' : 'Putar'}
                  aria-pressed={playing}
                  onClick={toggle}
                >
                  {playing ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <button aria-label="Lagu berikutnya" onClick={() => step(1)}>
                  <SkipForward size={16} />
                </button>
              </div>
            </div>
            <small className={styles.dragHint}>Geser gramofon untuk melihat dari sisi lain</small>
          </div>
          {youtube && (
            <p className={styles.note}>Diputar dari YouTube. Videonya tampil di pemutar kecil.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Rotary knob: drag up/down or around, scroll, or use the arrow keys. */
function Knob({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const drag = useRef<{ y: number; start: number } | null>(null);
  const angle = -135 + value * 270;
  return (
    <div className={styles.knobWrap}>
      <div
        className={styles.knob}
        role="slider"
        tabIndex={0}
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, start: value };
        }}
        onPointerMove={(e) => {
          if (drag.current) onChange(drag.current.start + (drag.current.y - e.clientY) / 160);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onWheel={(e) => onChange(value - e.deltaY / 1500)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(value + 0.05);
          if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(value - 0.05);
        }}
      >
        <i style={{ transform: `rotate(${angle}deg)` }} />
      </div>
      <small>
        {label} {Math.round(value * 100)}
      </small>
    </div>
  );
}
