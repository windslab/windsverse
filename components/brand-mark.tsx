"use client";
import {useEffect} from 'react';

export function BrandMark({logo}:{logo?:string}){
 useEffect(()=>{const link=document.querySelector<HTMLLinkElement>('link[rel="icon"]');if(link)link.href=logo||'/favicon.svg';},[logo]);
 return <div className="brand-mark">{logo?<img src={logo} alt="Logo Winds Space"/>:'W'}</div>;
}
