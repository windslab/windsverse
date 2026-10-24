'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, ArrowDownToLine, Hand, RotateCcw, Pause, Play } from 'lucide-react';
import styles from './studio.module.css';

const Viewer = dynamic(() => import('./viewer'), {
  ssr: false,
  loading: () => (
    <img
      className={styles.poster}
      src="/models/luna-ps1-preview.webp?v=6"
      alt="Luna, barista chibi perempuan dengan rambut bob cokelat, kaus pink, dan rompi abu-abu gelap"
    />
  ),
});

export default function LunaStudio() {
  const [moving, setMoving] = useState(true),
    [wave, setWave] = useState(0),
    [reset, setReset] = useState(0);
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a href="/">
          <ArrowLeft size={16} /> Kembali ke kafe
        </a>
        <span>
          WINDS SPACE <i> / </i> MEET THE BARISTA
        </span>
      </header>
      <div className={styles.layout}>
        <section className={styles.copy}>
          <span className={styles.eyebrow}>TEMAN BARUMU DI WINDS SPACE</span>
          <h1>
            Hai, aku
            <br />
            <em>Luna.</em>
            <span>✳</span>
          </h1>
          <p>
            Rambut pendek, senyum kecil,
            <br />
            dan selalu siap menyambutmu.
          </p>
          <div className={styles.details}>
            <span>
              01 <b>Rambut bob cokelat</b>
            </span>
            <span>
              02 <b>Kaus pink & rompi charcoal</b>
            </span>
            <span>
              03 <b>Gelang, cargo & sneakers krem</b>
            </span>
          </div>
          <div className={styles.palette} aria-label="Palet warna Luna">
            <i style={{ background: '#64442f' }} />
            <i style={{ background: '#d497ae' }} />
            <i style={{ background: '#45454a' }} />
            <i style={{ background: '#eee4d2' }} />
            <span>Warna-warna yang hangat.</span>
          </div>
          <a
            className={styles.download}
            href="/models/luna-ps1.glb?v=6"
            download="Luna-Winds-Space.glb"
          >
            <ArrowDownToLine size={16} /> Unduh model 3D <small>GLB</small>
          </a>
        </section>
        <section className={styles.stage} aria-label="Pratinjau 3D Luna">
          <div className={styles.stageTop}>
            <span>
              LUNA <i> / </i> CHARACTER No. 01
            </span>
            <span className={styles.stageBadge}>3D CHIBI</span>
          </div>
          <div className={styles.viewport}>
            <Viewer moving={moving} wave={wave} reset={reset} />
          </div>
          <div className={styles.controls}>
            <button
              onClick={() => {
                setMoving(true);
                setWave((n) => n + 1);
              }}
            >
              <Hand size={16} /> Sapa Luna
            </button>
            <button
              aria-pressed={!moving}
              onClick={() => setMoving((v) => !v)}
              title={moving ? 'Jeda gerakan' : 'Aktifkan gerakan'}
            >
              {moving ? <Pause size={16} /> : <Play size={16} />}
              <span>{moving ? 'Jeda' : 'Gerakkan'}</span>
            </button>
            <button onClick={() => setReset((n) => n + 1)} aria-label="Kembalikan sudut kamera">
              <RotateCcw size={16} />
            </button>
          </div>
          <p className={styles.hint}>
            Seret untuk memutar · Scroll atau cubit untuk melihat lebih dekat
          </p>
        </section>
      </div>
      <footer className={styles.footer}>
        <span>Dirancang untuk Winds Space.</span>
        <span>SMALL DETAILS, WARM COMPANY.</span>
      </footer>
    </main>
  );
}
