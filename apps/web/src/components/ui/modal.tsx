"use client";
import { useEffect,useId,useRef,type ReactNode } from "react";
import { Button } from "./button";
import { useTranslations } from "../i18n/i18n-provider";
export interface ModalProps{children:ReactNode;description?:string;isOpen:boolean;onClose:()=>void;title:string;}
export function Modal({children,description,isOpen,onClose,title}:ModalProps){
 const ref=useRef<HTMLDialogElement>(null);const label=useId();const {locale}=useTranslations();
 useEffect(()=>{const el=ref.current;if(!isOpen)return;const focused=document.activeElement as HTMLElement|null;el?.showModal();return()=>{el?.close();focused?.focus();};},[isOpen]);
 if(!isOpen)return null;
 return <dialog ref={ref} className="owner-dialog" aria-labelledby={label} onClick={e => { if (e.target !== e.currentTarget) return; const r=e.currentTarget.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) onClose(); }} onCancel={e=>{e.preventDefault();e.stopPropagation();onClose();}}><header><div><h2 id={label}>{title}</h2>{description&&<p>{description}</p>}</div><Button aria-label={locale==="id-ID"?"Tutup":"Close modal"} onClick={onClose} size="sm" variant="ghost">{locale==="id-ID"?"Tutup":"Close"}</Button></header><div>{children}</div></dialog>;
}
