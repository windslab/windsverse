'use client';
import {useState} from 'react';
import {ArrowUpRight,Coffee,LoaderCircle,Search} from 'lucide-react';
import {money,type Row} from '@/lib/model';

export default function PublicMenuSection({catalog,error,onRetry}:{catalog:{categories:Row[];products:Row[]}|null;error:string;onRetry:()=>void}){
 const [query,setQuery]=useState(''),[category,setCategory]=useState('all');
 const selected=category==='all'||catalog?.categories.some(item=>item.id===category)?category:'all';
 const products=(catalog?.products||[]).filter(product=>(selected==='all'||product.category===selected)&&[product.name,product.description].some(value=>String(value||'').toLowerCase().includes(query.trim().toLowerCase()))).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)||a.name.localeCompare(b.name,'id'));
 return <section className="landing-menu-section" id="menu" aria-labelledby="landing-menu-title" tabIndex={-1}>
  <div className="catalog-heading"><div><span className="landing-kicker">DARI DAPUR & BAR KAMI</span><h2 id="landing-menu-title">Temukan teman untuk harimu.</h2><p>Kopi favorit, sesuatu yang manis, dan alasan untuk duduk lebih lama.</p></div><a href="/menu">Halaman menu <ArrowUpRight size={16}/></a></div>
  <div className="catalog-toolbar"><div className="catalog-categories" aria-label="Kategori menu">{[{id:'all',name:'Semua'},...(catalog?.categories||[])].map(item=><button key={item.id} type="button" aria-pressed={selected===item.id} className={selected===item.id?'active':''} onClick={()=>setCategory(item.id)}>{item.name}</button>)}</div><label className="catalog-search"><Search size={17}/><span className="sr-only">Cari menu kafe</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari menu…"/></label></div>
  {error&&<div role="alert" className="catalog-error"><p>{error}</p><button className="button" onClick={onRetry}>Coba lagi</button></div>}
  {!catalog&&!error?<p role="status" className="catalog-empty"><LoaderCircle size={19} className="spin"/> Memuat menu…</p>:<div className="landing-menu-grid">{products.map(product=><article className="landing-menu-card" key={product.id}><div className="landing-menu-image">{product.image?<img src={product.image} alt={product.name} loading="lazy"/>:<Coffee size={40}/>}<span className={'catalog-stock '+(product.status==='habis'?'sold-out':'')}>{product.status==='habis'?'Sedang habis':'Tersedia'}</span></div><div className="landing-menu-copy"><span className="catalog-category">{catalog?.categories.find(item=>item.id===product.category)?.name||'Menu kafe'}</span><h3>{product.name}</h3>{product.description&&<p>{product.description}</p>}<strong>{money(product.price)}</strong></div></article>)}</div>}
  {catalog&&!products.length&&<p className="catalog-empty">{catalog.products.length?'Menu yang kamu cari belum ditemukan.':'Menu akan segera hadir.'}</p>}
 </section>;
}
