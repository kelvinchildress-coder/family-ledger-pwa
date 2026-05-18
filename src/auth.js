const P=import.meta.env.VITE_APP_PASSWORD||'family2024',AK='flauth',IK='flidentity';
export const checkAuth=()=>sessionStorage.getItem(AK)==='true'||localStorage.getItem(AK)==='true';
export function login(p,r=false){if(p===P){r?localStorage.setItem(AK,'true'):sessionStorage.setItem(AK,'true');return true}return false}
export function logout(){[AK,IK].forEach(k=>{sessionStorage.removeItem(k);localStorage.removeItem(k)})}
export const getIdentity=()=>JSON.parse(localStorage.getItem(IK)||'null');
export const setIdentity=u=>localStorage.setItem(IK,JSON.stringify(u));
export const getAvailableUsers=()=>[{name:'Enrique',email:'enrique.childress.18@gmail.com',color:'#e91e63',emoji:'E'},{name:'Kelvin',email:'kelvinchildress13@gmail.com',color:'#2196f3',emoji:'K'}]
