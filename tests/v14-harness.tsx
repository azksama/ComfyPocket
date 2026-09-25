import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import PromptEditor from '../src/PromptEditor';
import AppUpdater,{UpdateSettings} from '../src/AppUpdater';
import '../src/styles.css';import '../src/experience.css';import '../src/mochi.css';import '../src/mobile.css';import '../src/settings-hub.css';
function Harness(){const [values,setValues]=useState({positive:'bed, blue_eyes,',negative:''});const [open,setOpen]=useState(true);return location.search.includes('update')?<><AppUpdater/><UpdateSettings/></>:open?<PromptEditor initialTab="positive" values={values} onChange={setValues} onClose={()=>setOpen(false)}/>:<output>{values.positive}</output>}
createRoot(document.getElementById('root')!).render(<Harness/>);
