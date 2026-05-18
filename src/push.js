const VK=import.meta.env.VITE_VAPID_PUBLIC_KEY,PK='flpush';
function b64(s){const pad='='.repeat((4-s.length%4)%4);const b=(s+pad).replace(/-/g,'+').replace(/_/g,'/');const r=window.atob(b);const a=new Uint8Array(r.length);for(let i=0;i<r.length;i++)a[i]=r.charCodeAt(i);return a}
export async function requestPushPermission(){if(!('Notification' in window))return false;const pm=await Notification.requestPermission();if(pm!=='granted')return false;try{const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(VK)});localStorage.setItem(PK,JSON.stringify(sub));return sub}catch(e){return false}}
export const getPushSubscription=()=>{const s=localStorage.getItem(PK);return s?JSON.parse(s):null};
export const isPushEnabled=()=>Notification.permission==='granted'&&!!getPushSubscription();
export async function sendPushSubscriptionToServer(u,sub,url){if(!sub||!url)return;try{await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'savePushSubscription',userId:u,subscription:sub})})}catch(e){console.error(e)}}
export async function showLocalNotification(t,b){if(Notification.permission!=='granted')return;const reg=await navigator.serviceWorker.ready;reg.showNotification(t,{body:b,icon:'/pwa-192x192.png'})}
