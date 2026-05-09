import React, { useState, useEffect, useRef } from 'react';

const URL = `http://${window.location.hostname}:8000`;
const WS = `ws://${window.location.hostname}:8000/ws`;

let audioCtx = null;
const playSFX = (type) => {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination); const now = audioCtx.currentTime;

  if (type === 'slash') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(450, now); osc.frequency.exponentialRampToValueAtTime(150, now + 0.1); gain.gain.setValueAtTime(0.08, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1); osc.start(now); osc.stop(now + 0.1); } 
  else if (type === 'arrow') { osc.type = 'sine'; osc.frequency.setValueAtTime(900, now); osc.frequency.linearRampToValueAtTime(300, now + 0.1); gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0.01, now + 0.1); osc.start(now); osc.stop(now + 0.1); }
  else if (type === 'throw') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(800, now); osc.frequency.linearRampToValueAtTime(600, now + 0.1); gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0.01, now + 0.1); osc.start(now); osc.stop(now + 0.1); }
  else if (type === 'thrust') { osc.type = 'triangle'; osc.frequency.setValueAtTime(250, now); gain.gain.setValueAtTime(0.12, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08); osc.start(now); osc.stop(now + 0.08); }
  else if (type === 'bash') { osc.type = 'square'; osc.frequency.setValueAtTime(120, now); osc.frequency.exponentialRampToValueAtTime(50, now + 0.15); gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15); osc.start(now); osc.stop(now + 0.15); }
  else if (type === 'shout') { osc.type = 'square'; osc.frequency.setValueAtTime(300, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.08); gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08); osc.start(now); osc.stop(now + 0.08); }
  else if (type === 'death') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, now); osc.frequency.exponentialRampToValueAtTime(30, now + 0.6); gain.gain.setValueAtTime(0.25, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6); osc.start(now); osc.stop(now + 0.6); }
  else if (type === 'warning') { osc.type = 'square'; osc.frequency.setValueAtTime(200, now); osc.frequency.setValueAtTime(150, now + 0.5); gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0); osc.start(now); osc.stop(now + 1.0); }
  else if (type === 'win') { osc.type = 'square'; [440, 554, 659, 880].forEach((freq, i) => { osc.frequency.setValueAtTime(freq, now + i*0.15); }); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 1.0); osc.start(now); osc.stop(now + 1.0); }
};

const speakCaster = (text, langStr) => {
  if (!window.speechSynthesis) return;
  const cleanText = text.replace(/🎙️|🏆|💀|🔥|⚡|☠️|⚠️/g, '').replace(/\[.*?s\]/g, '').trim();
  if (!cleanText) return;
  
  const utterance = new SpeechSynthesisUtterance(cleanText);
  const voices = window.speechSynthesis.getVoices();
  
  if (langStr === 'en') {
      utterance.voice = voices.find(v => v.lang.startsWith('en')) || null;
      utterance.lang = 'en-US';
  } else {
      const vnVoice = voices.find(v => v.lang === 'vi-VN' || v.lang.includes('vi') || v.name.includes('Vietnamese'));
      utterance.voice = vnVoice || voices[0];
      utterance.lang = 'vi-VN';
  }
  utterance.rate = 1.2; utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
};

function App() {
  const [lobby, setLobby] = useState([]);
  const [statsWiki, setStatsWiki] = useState(null);
  const [state, setState] = useState({ status: 'waiting', players: [], logs: [], timer: 0, config: {title:'ARENA', bg:'#0f172a', w:800, h:600, lang:'vi'}, safe_zone: null });
  
  // FIX CHỐNG SẬP API: Bộ đệm LocalConfig
  const [localConfig, setLocalConfig] = useState(null);

  const [reg, setReg] = useState({ name: '', password: '', weapon: 'sword', shield: 'wood_shield' });
  const [strat, setStrat] = useState({ name: '', password: '', target_rule: 'closest', camp_until: 99 });
  const [isHost, setIsHost] = useState(false);
  const canvasRef = useRef(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const logCountRef = useRef(0);
  const hasAnnouncedWin = useRef(false);

  const isPlaying = state.status === 'playing' || state.status === 'finished';
  // Lấy dữ liệu hiển thị (Ưu tiên bộ đệm chưa lưu, nếu không có thì lấy Server)
  const currentConfig = localConfig || state.config || {title:'ARENA', bg:'#0f172a', w:800, h:600, lang:'vi'};

  useEffect(() => {
    fetch(`${URL}/stats`).then(r=>r.json()).then(setStatsWiki).catch(err => console.error("API Lỗi (Hãy xóa file JSON cũ):", err));
    const fetchLobby = () => fetch(`${URL}/lobby`).then(r => r.json()).then(d => setLobby(Array.isArray(d) ? d : [])).catch(() => setLobby([]));
    fetchLobby(); const inv = setInterval(fetchLobby, 2000);
    
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();

    const socket = new WebSocket(WS);
    socket.onmessage = (e) => {
      const data = JSON.parse(e.data); setState(data);
      const lang = data.config?.lang || 'vi';
      
      if (data.status === 'playing') {
          draw(data);
          hasAnnouncedWin.current = false;
          if (data.logs && data.logs.length > logCountRef.current) {
              const newLogs = data.logs.slice(logCountRef.current);
              logCountRef.current = data.logs.length;
              if (soundEnabled) {
                  newLogs.forEach(log => {
                      speakCaster(log, lang);
                      if (log.includes('💀') || log.includes('☠️')) playSFX('death');
                      if (log.includes('⚠️')) playSFX('warning');
                  });
              }
          }
      } 
      else if (data.status === 'finished' && data.winner_info) {
          draw(data);
          if (!hasAnnouncedWin.current) {
              hasAnnouncedWin.current = true;
              if (soundEnabled) {
                  playSFX('win');
                  const winner = data.winner_info;
                  const kills = data.logs.filter(l => l.includes('💀') && l.includes(winner.name)).length;
                  const duration = data.logs.find(l => l.includes('🏆'))?.match(/(\d+) (GIÂY|s)/)?.[1] || "";
                  
                  const summary = lang === 'en' 
                    ? `Match complete in ${duration} seconds! Congratulations ${winner.name}. With ${winner.weapon} and ${winner.shield}, this legend took ${kills} kills!`
                    : `Trận đấu kết thúc sau ${duration} giây! Chúc mừng ${winner.name}. Cầm ${winner.weapon} và ${winner.shield}, huyền thoại này đã có ${kills} mạng hạ gục!`;
                  
                  setTimeout(() => speakCaster(summary, lang), 1500);
              }
          }
      }
      else {
          logCountRef.current = 0;
          if (data.status === 'waiting') hasAnnouncedWin.current = false;
      }
    };
    return () => { clearInterval(inv); socket.close(); if (window.speechSynthesis) window.speechSynthesis.cancel(); };
  }, [soundEnabled]);

  const draw = (data) => {
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx || !data.config) return;
    
    ctx.fillStyle = data.config.bg; ctx.fillRect(0, 0, data.config.w, data.config.h);
    
    if (data.safe_zone) {
        ctx.save();
        ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
        ctx.fillRect(0, 0, data.config.w, data.config.h);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(data.safe_zone.x, data.safe_zone.y, data.safe_zone.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(data.safe_zone.x, data.safe_zone.y, data.safe_zone.radius, 0, Math.PI * 2);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    data.particles?.forEach(p => {
      if(soundEnabled) { playSFX(p.type); if (Math.random() > 0.6) playSFX('shout'); }
      ctx.strokeStyle = p.c; ctx.beginPath(); const angle = Math.atan2(p.y2 - p.y1, p.x2 - p.x1);
      if (p.type === 'slash') { ctx.lineWidth = 5; ctx.arc(p.x2, p.y2, 35, angle - Math.PI/1.5, angle + Math.PI/1.5); }
      else if (p.type === 'thrust') { ctx.lineWidth = 4; ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); }
      else if (p.type === 'arrow') { ctx.lineWidth = 3; ctx.setLineDash([15, 10]); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); }
      else if (p.type === 'throw') { ctx.lineWidth = 4; ctx.setLineDash([8, 12]); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); }
      else if (p.type === 'bash') { ctx.lineWidth = 8; ctx.arc(p.x2, p.y2, 40, 0, Math.PI*2); }
      ctx.stroke(); ctx.setLineDash([]);
    });

    data.players?.forEach(p => {
      if (p.hp <= 0) return;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.range, 0, Math.PI*2); ctx.strokeStyle = `rgba(255, 255, 255, 0.05)`; ctx.lineWidth = 1; ctx.stroke();
      if(p.min_rng > 0) { ctx.beginPath(); ctx.arc(p.x, p.y, p.min_rng, 0, Math.PI*2); ctx.strokeStyle = `rgba(255, 100, 100, 0.05)`; ctx.stroke(); }
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'; ctx.strokeStyle = p.color; ctx.lineWidth = 2;
      ctx.strokeRect(p.x-25, p.y-30, 50, 55); ctx.fillRect(p.x-25, p.y-30, 50, 55);
      ctx.font = '22px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = 'white';
      ctx.fillText(`${p.icon}${p.s_icon}`, p.x, p.y+10);
      ctx.font = 'bold 10px sans-serif'; ctx.fillText(p.name, p.x, p.y-15);
      ctx.fillStyle = '#444'; ctx.fillRect(p.x-20, p.y+15, 40, 5);
      ctx.fillStyle = p.hp > 250 ? '#22c55e' : p.hp > 100 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(p.x-20, p.y+15, Math.max(0, (p.hp/500)*40), 5);
    });
  };

  const call = (path, body, method='POST') => fetch(`${URL}${path}`, { method, headers: {'Content-Type': 'application/json'}, body: body ? JSON.stringify(body) : null }).then(r => r.json());

  return (
    <div className={`bg-slate-950 text-slate-100 p-2 md:p-4 font-sans flex flex-col items-center overflow-hidden ${isPlaying ? 'h-screen' : 'min-h-screen'}`}>
      
      <div className={`flex flex-col md:flex-row items-center gap-2 md:gap-4 w-full justify-between transition-all ${isPlaying ? 'mb-2 px-2 max-w-full' : 'mb-4 md:mb-8 max-w-7xl'}`}>
        <div className="flex items-center gap-4">
            <h1 className="text-2xl md:text-4xl font-black text-yellow-500 uppercase tracking-tighter drop-shadow-md">{state.config?.title || 'ARENA'}</h1>
            <label className="text-[10px] md:text-xs text-slate-500 cursor-pointer border border-slate-800 p-1 md:p-2 rounded hover:text-yellow-500">
            <input type="checkbox" className="hidden" onChange={e => {
                if (e.target.checked && prompt("Pass Host:") === "dev123") setIsHost(true);
                else { e.target.checked = false; setIsHost(false); }
            }} /> ⚙️ HOST
            </label>
        </div>
        <button className={`text-xs p-2 font-bold rounded-lg transition-all border ${soundEnabled ? 'bg-green-900 border-green-400 text-green-100' : 'bg-slate-800 border-slate-700 text-slate-400'}`} onClick={() => {
            setSoundEnabled(!soundEnabled); 
            if(!soundEnabled) { playSFX('slash'); speakCaster(state.config?.lang === 'en' ? "Audio enabled!" : "Đã bật giọng nói!", state.config?.lang); } 
            else { if(window.speechSynthesis) window.speechSynthesis.cancel(); }
        }}>
            {soundEnabled ? "🔊 AUDIO: ON" : "🔇 AUDIO: OFF"}
        </button>
      </div>

      {/* HOST PANEL ĐÃ ĐƯỢC CHỐNG SPAM API */}
      {isHost && !isPlaying && (
        <div className="mb-6 p-3 md:p-4 bg-slate-900 border border-yellow-600/30 rounded-xl flex flex-col gap-3 w-full max-w-7xl text-xs md:text-sm shadow-xl">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <input className="bg-slate-800 p-2 rounded outline-none" placeholder="Title" value={currentConfig.title} onChange={e=>setLocalConfig({...currentConfig, title: e.target.value})} />
              <select className="bg-slate-800 p-2 rounded outline-none font-bold" value={currentConfig.lang} onChange={e=>setLocalConfig({...currentConfig, lang: e.target.value})}>
                  <option value="vi">🇻🇳 Tiếng Việt</option>
                  <option value="en">🇺🇸 English</option>
              </select>
              <input className="bg-slate-800 p-1 rounded h-full w-full cursor-pointer" type="color" value={currentConfig.bg} onChange={e=>setLocalConfig({...currentConfig, bg: e.target.value})} />
              <div className="flex items-center gap-2">W:<input className="bg-slate-800 p-2 rounded w-full outline-none" type="number" value={currentConfig.w} onChange={e=>setLocalConfig({...currentConfig, w: parseInt(e.target.value)})} /></div>
              <div className="flex items-center gap-2">H:<input className="bg-slate-800 p-2 rounded w-full outline-none" type="number" value={currentConfig.h} onChange={e=>setLocalConfig({...currentConfig, h: parseInt(e.target.value)})} /></div>
          </div>
          {localConfig && (
              <button className="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-black p-2 rounded animate-pulse" 
                onClick={() => { 
                  call('/config', localConfig).then(() => setLocalConfig(null)).catch(err => alert("Lỗi kết nối Server!"));
                }}>
                 💾 LƯU CẤU HÌNH VÀ MÀU SẮC LÊN SERVER
              </button>
          )}
        </div>
      )}

      {state.status === 'waiting' && (
        <div className="max-w-7xl w-full flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-900 p-5 md:p-8 rounded-2xl border border-slate-800 shadow-2xl">
              <h2 className="text-lg md:text-xl font-bold mb-4 md:mb-6 text-blue-400">1. {state.config?.lang === 'en' ? 'REGISTER' : 'ĐĂNG KÝ'}</h2>
              <div className="grid gap-4">
                <input className="bg-slate-800 p-3 md:p-4 rounded-xl outline-none focus:ring-2 ring-blue-500" placeholder={state.config?.lang === 'en' ? 'Your Name...' : 'Tên nhân vật...'} value={reg.name} onChange={e=>setReg({...reg, name:e.target.value})}/>
                <input className="bg-slate-800 p-3 md:p-4 rounded-xl text-xs md:text-sm outline-none" type="password" placeholder={state.config?.lang === 'en' ? 'Secret Password...' : 'Mật khẩu...'} value={reg.password} onChange={e=>setReg({...reg, password:e.target.value})}/>
                <div className="flex gap-3">
                  <select className="bg-slate-800 p-3 flex-1 rounded-xl text-xs md:text-sm outline-none" value={reg.weapon} onChange={e=>setReg({...reg, weapon:e.target.value})}>
                    {statsWiki && Object.entries(statsWiki.weapons).map(([k, w]) => <option key={k} value={k}>{w.icon} {w.name}</option>)}
                  </select>
                  <select className="bg-slate-800 p-3 flex-1 rounded-xl text-xs md:text-sm outline-none" value={reg.shield} onChange={e=>setReg({...reg, shield:e.target.value})}>
                    {statsWiki && Object.entries(statsWiki.shields).map(([k, s]) => <option key={k} value={k}>{s.icon} {s.name}</option>)}
                  </select>
                </div>
                <button className="mt-2 bg-blue-600 hover:bg-blue-500 font-bold p-4 rounded-xl shadow-lg transition-transform active:scale-95 text-white" onClick={()=>call('/register', reg).then(d=>{ if(d.status==='success') setReg({...reg, name:'', password:''}); else alert(d.message); })}>{state.config?.lang === 'en' ? 'JOIN ARENA' : 'GIA NHẬP SẢNH'}</button>
              </div>
            </div>
            <div className="bg-slate-900 p-5 md:p-8 rounded-2xl border border-slate-800 flex flex-col shadow-2xl">
              <div className="flex justify-between items-center mb-4 md:mb-6">
                <h2 className="text-lg md:text-xl font-bold uppercase text-slate-400">LOBBY ({lobby.length})</h2>
                {isHost && <div className="flex gap-2">
                    <button className="bg-green-900/50 text-green-300 hover:bg-green-600 px-2 md:px-3 py-1.5 rounded text-[10px] md:text-xs transition-colors" onClick={()=>call('/add-bots')}>🤖 +10 BOTS</button>
                    <button className="bg-red-900/50 text-red-300 hover:bg-red-600 px-2 md:px-3 py-1.5 rounded text-[10px] md:text-xs transition-colors" onClick={()=>call('/reset-all')}>RESET</button>
                </div>}
              </div>
              <div className="space-y-2 flex-grow overflow-y-auto max-h-[250px] pr-2 custom-scrollbar">
                {lobby.length === 0 && <p className="text-xs text-slate-600 text-center mt-10">Chưa có ai tham gia...</p>}
                {lobby.map(p => (
                  <div key={p.name} className="p-3 bg-slate-800/80 rounded-xl flex justify-between items-center border-l-4" style={{borderColor: p.color}}>
                    <span className="font-medium text-slate-200 text-sm md:text-base">👤 {p.name}</span> 
                    {isHost && <button onClick={()=>call(`/player/${p.name}`, null, 'DELETE')} className="text-red-900 font-bold px-2 hover:text-red-500">×</button>}
                  </div>
                ))}
              </div>
              {isHost && <button className="w-full mt-4 bg-yellow-600 hover:bg-yellow-500 text-black font-black p-4 rounded-xl shadow-lg transition-transform active:scale-95" onClick={()=>call('/phase-strategy')}>NEXT PHASE →</button>}
            </div>
          </div>
          
          <div className="bg-slate-900 p-5 md:p-8 rounded-2xl border border-slate-800 shadow-2xl">
            <h2 className="text-sm font-bold text-yellow-500 mb-4 uppercase tracking-widest border-b border-slate-800 pb-3 text-center md:text-left">📖 {state.config?.lang === 'en' ? 'Game Rules & Stats' : 'Tàng Kinh Các (Chỉ số & Luật)'}</h2>
            {statsWiki ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs md:text-sm text-slate-400">
                <div className="space-y-2 bg-slate-800/30 p-4 rounded-xl border border-slate-800/50">
                  <h3 className="text-blue-400 font-black mb-3 text-sm">WEAPONS (HP: 500)</h3>
                  {Object.entries(statsWiki.weapons).map(([k, w]) => (<div key={k} className="mb-2 pb-2 border-b border-slate-800/50 last:border-0"><span className="text-white font-bold">{w.icon} {w.name}</span>: Tầm ({w.min_rng}-{w.rng}) | Đam {w.dmg} | CD {w.cd}s | Nặng {w.wt}<br/><span className="italic text-[10px] text-slate-500">{w.desc}</span></div>))}
                </div>
                <div className="space-y-2 bg-slate-800/30 p-4 rounded-xl border border-slate-800/50">
                  <h3 className="text-green-400 font-black mb-3 text-sm">SHIELDS</h3>
                  {Object.entries(statsWiki.shields).map(([k, s]) => (<div key={k} className="mb-2 pb-2 border-b border-slate-800/50 last:border-0"><span className="text-white font-bold">{s.icon} {s.name}</span>: Đỡ {s.def}% đam | Nặng {s.wt}<br/><span className="italic text-[10px] text-slate-500">{s.desc}</span></div>))}
                </div>
                <div className="space-y-3 bg-slate-800/30 p-4 rounded-xl border border-slate-800/50 text-white font-mono text-[11px] md:text-xs">
                  <h3 className="text-purple-400 font-black mb-2 font-sans text-sm">AI TACTICS</h3>
                  <p>🏃 <span className="text-slate-400">Tốc độ =</span> 180 - Nặng</p>
                  <p>💥 <span className="text-slate-400">Khắc hệ =</span> <span className="text-yellow-400 font-bold">x2.0 Đam!</span></p>
                  <p>🔪 <span className="text-slate-400">Dao găm:</span> Chạy lạng lách dích dắc để né tên.</p>
                  <p>🏹 <span className="text-slate-400">Hit & Run:</span> Lùi nếu bị áp sát. <span className="text-red-400">Bắn Khiên thép bị giảm 50% sát thương gốc!</span></p>
                  <p>🔥 <span className="text-red-400 font-bold">Berserk Mode:</span> HP {'<'} 30% tự động BỎ NÚP, lao lên khô máu!</p>
                </div>
              </div>
            ) : <p className="text-center text-red-500 animate-pulse font-bold mt-4">⚠️ Lỗi mất kết nối Backend. Vui lòng tắt Server, XÓA file game_config.json & game_data.json, sau đó bật lại!</p>}
          </div>
        </div>
      )}

      {state.status === 'strategy' && (
        <div className="max-w-2xl w-full bg-slate-900 p-5 md:p-10 rounded-3xl border-2 border-purple-500/50 shadow-2xl mt-10">
          <div className="text-center mb-6">
            <h2 className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-2">{state.config?.lang === 'en' ? 'STRATEGY TIMER' : 'ĐẾM NGƯỢC CHIẾN THUẬT'}</h2>
            <div className="text-6xl md:text-8xl font-black text-white tabular-nums tracking-tighter drop-shadow-[0_0_15px_rgba(168,85,247,0.3)]">
              {Math.floor(state.timer / 60)}:{(state.timer % 60).toString().padStart(2, '0')}
            </div>
            {isHost && <button className="mt-4 bg-red-600 hover:bg-red-500 px-6 py-2 rounded-full font-black text-white shadow-lg animate-pulse" onClick={()=>call('/start-now')}>🚀 START NOW</button>}
          </div>
          <div className="space-y-4">
            <input className="w-full bg-slate-800 p-4 rounded-xl border border-slate-700 outline-none" placeholder={state.config?.lang === 'en' ? 'Name...' : 'Tên của bạn...'} value={strat.name} onChange={e=>setStrat({...strat, name:e.target.value})}/>
            <input className="w-full bg-slate-800 p-4 rounded-xl border border-slate-700 outline-none" type="password" placeholder={state.config?.lang === 'en' ? 'Password...' : 'Mật khẩu...'} value={strat.password} onChange={e=>setStrat({...strat, password:e.target.value})}/>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <select className="w-full bg-slate-800 p-4 rounded-xl text-xs md:text-sm outline-none" value={strat.target_rule} onChange={e=>setStrat({...strat, target_rule:e.target.value})}>
                <option value="closest">{state.config?.lang === 'en' ? 'Target Closest' : 'Đánh Gần nhất'}</option><option value="lowest_hp">{state.config?.lang === 'en' ? 'Target Weakest' : 'Đánh Yếu nhất'}</option><option value="highest_hp">{state.config?.lang === 'en' ? 'Target Tanker' : 'Đánh Trâu nhất'}</option><option value="counter">{state.config?.lang === 'en' ? 'Target Synergy' : 'Đánh Khắc hệ'}</option>
              </select>
              <select className="w-full bg-slate-800 p-4 rounded-xl text-xs md:text-sm outline-none" value={strat.camp_until} onChange={e=>setStrat({...strat, camp_until:parseInt(e.target.value)})}>
                <option value="99">{state.config?.lang === 'en' ? 'Full Attack' : 'Đánh ngay từ đầu'}</option><option value="5">{state.config?.lang === 'en' ? 'Camp to Top 5' : 'Núp tới Top 5'}</option><option value="3">{state.config?.lang === 'en' ? 'Camp to Top 3' : 'Núp tới Top 3'}</option><option value="2">{state.config?.lang === 'en' ? 'Camp to Final 2' : 'Núp tới Chung Kết'}</option>
              </select>
            </div>
            <button className="w-full mt-4 bg-purple-600 hover:bg-purple-500 font-black text-white p-5 rounded-2xl shadow-xl transition-all active:scale-95" onClick={()=>call('/update-strategy', strat).then(d=> alert(d.status==='success' ? "LOCKED!" : d.message))}>{state.config?.lang === 'en' ? 'SAVE STRATEGY' : 'KHÓA CHIẾN THUẬT'}</button>
          </div>
        </div>
      )}

      {isPlaying && state.config && (
        <div className="flex flex-col lg:flex-row gap-4 w-full max-w-full flex-grow overflow-hidden pb-2 px-2">
          
          <div className="flex-grow relative bg-black rounded-2xl border-[4px] border-slate-800 shadow-2xl flex justify-center items-center overflow-hidden">
            <canvas ref={canvasRef} width={state.config.w} height={state.config.h} className="w-full h-full object-contain block drop-shadow-2xl" />
            
            {state.status === 'finished' && (
              <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-500 z-50">
                <h2 className="text-5xl md:text-8xl font-black text-yellow-500 mb-2 italic tracking-tighter leading-none">THE CHAMPION</h2>
                <div className="text-4xl md:text-6xl font-bold mb-6 text-white uppercase border-b-4 border-yellow-500 pb-2">{state.winner_info?.name}</div>
                {isHost && (
                  <div className="mt-8 flex flex-col sm:flex-row gap-3">
                      <button className="bg-blue-600 hover:bg-blue-500 px-10 py-4 rounded-full font-black text-white shadow-2xl" onClick={()=>call('/rematch')}>REMATCH</button>
                      <button className="bg-red-900 hover:bg-red-700 px-6 py-4 rounded-full font-bold text-sm shadow-xl" onClick={()=>call('/reset-all')}>RESET ALL</button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-slate-900 p-4 rounded-2xl w-full lg:w-96 flex-shrink-0 flex flex-col border border-slate-800 shadow-xl overflow-hidden h-[30vh] lg:h-full">
             <h3 className="font-bold text-red-500 mb-2 uppercase text-center text-[10px] tracking-widest opacity-80 border-b border-slate-800 pb-2">LIVE COMMENTARY</h3>
             <div className="flex-grow overflow-y-auto space-y-2 flex flex-col-reverse font-mono text-[10px] md:text-xs leading-relaxed pr-1 custom-scrollbar">
                {[...(state.logs || [])].reverse().map((l, i) => <div key={i} className={`p-2 md:p-3 rounded-lg border-l-4 ${l.includes('💀') || l.includes('🏆') || l.includes('🔥') || l.includes('☠️') || l.includes('⚠️') ? 'bg-red-950/40 border-red-600 text-red-200' : 'bg-slate-800/80 border-slate-600 text-slate-300'}`}>{l}</div>)}
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;