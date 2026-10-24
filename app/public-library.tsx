'use client';
import {useCallback,useEffect,useState} from 'react';
import {BookOpen,LoaderCircle,Search} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import type {PublicBook} from '@/lib/public-books';

export default function PublicLibrary({open,onOpenChange}:{open:boolean;onOpenChange:(open:boolean)=>void}){
 const [books,setBooks]=useState<PublicBook[]>([]),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{
  if(!open)return;
  let alive=true,controller:AbortController|undefined;
  const load=async()=>{
   controller?.abort();controller=new AbortController();
   try{const response=await fetch('/api/public?books=1',{cache:'no-store',signal:controller.signal}),data:any=await response.json();if(!response.ok)throw Error(data.error||'Koleksi buku belum dapat dimuat.');if(alive){setBooks(data.books||[]);setLoaded(true);setError('');}}
   catch(e){if(alive&&(e as Error).name!=='AbortError')setError((e as Error).message||'Koleksi buku belum dapat dimuat.');}
  };
  setQuery('');void load();
  const timer=setInterval(()=>{if(!document.hidden)void load();},15000);
  return()=>{alive=false;controller?.abort();clearInterval(timer);};
 },[open,retry]);
 const changeOpen=useCallback((next:boolean)=>{onOpenChange(next);},[onOpenChange]);
 const term=query.trim().toLocaleLowerCase('id'),filtered=books.filter(book=>[book.title,book.author,book.category,book.shelfLocation].some(value=>value?.toLocaleLowerCase('id').includes(term)));
 return <Dialog open={open} onOpenChange={changeOpen}><DialogContent className="public-library-dialog">
  <div className="library-heading"><span className="landing-kicker"><BookOpen size={15}/> PERPUSTAKAAN WINDS SPACE</span><DialogTitle>Kopi, ruang, dan sebuah cerita.</DialogTitle><DialogDescription>Jelajahi buku yang terdaftar di rak kami. Ketersediaan mengikuti catatan perpustakaan kafe.</DialogDescription></div>
  <label className="catalog-search"><Search size={17}/><span className="sr-only">Cari buku, penulis, kategori, atau rak</span><input placeholder="Cari judul, penulis, atau kategori…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  {error&&<div className="catalog-error" role="alert"><p>{error}</p><button className="button" onClick={()=>setRetry(value=>value+1)}>Coba lagi</button></div>}
  {!loaded&&!error?<p className="catalog-empty" role="status"><LoaderCircle size={19} className="spin"/> Memuat koleksi buku…</p>:loaded&&<>
   <div className="library-count" aria-live="polite">{filtered.length} buku{term?' ditemukan':' dalam koleksi'}</div>
   <div className="library-list">{filtered.map(book=><article className="library-book" key={book.id}>
    <div className="library-cover">{book.image?<img src={book.image} alt={'Sampul '+book.title} loading="lazy"/>:<BookOpen size={32}/>}</div>
    <div className="library-book-copy"><span className="catalog-category">{book.category}</span><h3>{book.title}</h3><p className="library-author">{book.author}</p><div className="library-meta"><span>{book.shelfLocation||'Rak kafe'}</span>{book.publisher&&<span>{book.publisher}{book.year?' · '+book.year:''}</span>}</div>{book.synopsis&&<p className="library-synopsis">{book.synopsis}</p>}
    <span className={'library-availability '+(book.available>0?'available':'unavailable')}>{book.available>0?`${book.available} eksemplar tersedia`:book.status==='pemeliharaan'?'Dalam perawatan':book.status==='hilang'?'Belum tersedia':'Sedang dipinjam'}</span></div>
   </article>)}</div>
   {!filtered.length&&<p className="catalog-empty">{books.length?'Tidak ada buku yang cocok. Coba kata kunci lain.':'Koleksi buku belum ditambahkan. Mampir lagi nanti, ya.'}</p>}
  </>}
 </DialogContent></Dialog>;
}
