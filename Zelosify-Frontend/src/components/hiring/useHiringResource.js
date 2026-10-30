"use client";
import {useCallback,useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import api from '@/utils/Axios/AxiosInstance';
export default function useHiringResource(url){
 const router=useRouter();const [state,setState]=useState({data:null,loading:true,error:''}),[version,setVersion]=useState({n:0,quiet:false});
 const refresh=useCallback((quiet=false)=>setVersion(v=>({n:v.n+1,quiet:quiet===true})),[]);
 useEffect(()=>{
  if(!url)return;
  const controller=new AbortController();if(!version.quiet)setState(s=>({...s,loading:true,error:''}));
  api.get(url,{signal:controller.signal}).then(({data})=>setState({data,loading:false,error:''})).catch(e=>{
   if(e.code==='ERR_CANCELED')return;
   if(e.response?.status===401){router.replace('/login');return;}
   setState({data:null,loading:false,error:e.response?.data?.message||'Check your connection and try again.'});
  });return()=>controller.abort();
 },[url,version,router]);
 return {...state,refresh};
}
