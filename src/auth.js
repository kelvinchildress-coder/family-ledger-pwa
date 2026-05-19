const P=import.meta.env.VITE_APP_PASSWORD||'family2024',AK='flauth',IK='flidentity';
export const checkAuth=()=>sessionStorage.getItem(AK)==='true'||localStorage.getItem(AK)==='true';
export function login(p,r=false){if(p===P){r?localStorage.setItem(AK,'true'):sessionStorage.setItem(AK,'true');return true}return false}
export function logout(){[AK,IK].forEach(k=>{sessionStorage.removeItem(k);localStorage.removeItem(k)})}
export const getIdentity=()=>JSON.parse(localStorage.getItem(IK)||'null');
export const setIdentity=u=>localStorage.setItem(IK,JSON.stringify(u));
export const getAvailableUsers=()=>[
  {name:'Kelvin',email:'kelvinchildress13@gmail.com',color:'#4a7c59',emoji:'K'},
  {name:'Enrique',email:'enrique.childress.18@gmail.com',color:'#e67e22',emoji:'E'},
  {name:'Andie',email:'thechildresses88@gmail.com',color:'#5d8a6a',emoji:'A'},
  {name:'Noa',email:'thechildresses88@gmail.com',color:'#7db87d',emoji:'N'}
]
