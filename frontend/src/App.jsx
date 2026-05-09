import React, { useState, useEffect, useRef } from 'react';

const URL = `http://${window.location.hostname}:8000`;
const WS = `ws://${window.location.hostname}:8000/ws`;

// --- AUDIO ENGINE 8-BIT TỰ TẠO TRÌNH DUYỆT ---
let audioCtx = null;
const playSFX = (type) => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime;

  if (type === 'slash') { // Tiếng chém (Kiếm/Dao)
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now); osc.stop(now + 0.1);
  } 
  else if (type === 'arrow') { // Tiếng vút (Cung)
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.linearRampToValueAtTime(200, now + 0.15);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
    osc.start(now); osc.stop(now + 0.15);
  }
  else if (type === 'thrust') { // Tiếng đâm (Giáo)
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, now);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
    osc.start(now); osc.stop(now + 0.05);
  }
  else if (type === 'magic') { // Tiếng chíu (Phép)
    osc.type = 'square';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.setValueAtTime(1200, now + 0.1);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.2);
    osc.start(now); osc.stop(now + 0.2);
  }
  else if (type === 'bash') { // Tiếng đập nện (Búa)
    osc.type = 'square';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc.start(now); osc.stop(now + 0.2);
  }
  else if (type === 'win') { // Nhạc chiến thắng
    osc.type = 'square';
    [440, 554, 659, 880].forEach((freq, i) => {
      osc.frequency.setValueAtTime(freq, now + i*0.15);
    });
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0, now + 1.0);
    osc.start(now); osc.stop(now + 1.0);
  }
};

function App() {
  const [lobby, setLobby] = useState([]);
  const [statsWiki, setStatsWiki] = useState(null);
  const [state, setState] = useState({ status: 'waiting', players: [], logs: [], timer: 0, config: {title:'ARENA', bg:'#0f172a', w:800, h:600} });
  const [reg, setReg] = useState({ name: '', password: '', weapon: 'sword', shield: 'wood_shield' });
  const [strat, setStrat] = useState({ name: '', password: '', target_rule: 'closest', camp_until: 99 });
  const [isHost, setIsHost] = useState(false);
  const canvasRef = useRef(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    fetch(`${URL}/stats`).then(r=>r.json()).then(setStatsWiki).catch(console.error);
    const fetchLobby = () => fetch(`${URL}/lobby`).then(r => r.json()).then(d => setLobby(Array.isArray(d) ? d : [])).catch(() => setLobby([]));
    fetchLobby(); const inv = setInterval(fetchLobby, 2000);
    
    const socket = new WebSocket(WS);
    socket.onmessage = (e) => {
      const data = JSON.parse(e.data); setState(data);
      if (data.status === 'playing') draw(data);
      if (data.status === 'finished' && data.winner_info && soundEnabled) playSFX('win');
    };
    return () => { clearInterval(inv); socket.close(); };
  }, [soundEnabled]);

  const draw = (data) => {
    const ctx = canvasRef.current?.getContext('2d'); 
    if (!ctx || !data.config) return;
    
    ctx.fillStyle = data.config.bg; ctx.fillRect(0, 0, data.config.w, data.config.h);
    
    // VẼ HIỆU ỨNG CHIÊU THỨC & ÂM THANH
    data.particles?.forEach(p => {
      if(soundEnabled) playSFX(p.type); // Phát âm thanh
      
      ctx.strokeStyle = p.c; ctx.lineWidth = 3; ctx.beginPath();
      if (p.type === 'slash') ctx.arc(p.x1, p.y1, 40, Math.atan2(p.y2-p.y1, p.x2-p.x1)-0.5, Math.atan2(p.y2-p.y1, p.x2-p.x1)+0.5);
      else if (p.type === 'thrust') { ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.lineWidth=1; }
      else if (p.type === 'arrow') { ctx.setLineDash([10,5]); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); }
      else if (p.type === 'magic') { ctx.lineWidth=5; ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke(); ctx.beginPath(); ctx.arc(p.x2, p.y2, 15, 0, Math.PI*2); }
      else if (p.type === 'bash') { ctx.lineWidth=8; ctx.arc(p.x2, p.y2, 30, 0, Math.PI*2); }
      ctx.stroke(); ctx.setLineDash([]);
    });

    // VẼ NGƯỜI CHƠI
    data.players?.forEach(p => {
      if (p.hp <= 0) return;
      
      // Vẽ vòng tròn thể hiện tầm đánh Max và Min (Mờ)
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.range, 0, Math.PI*2);
      ctx.strokeStyle = `rgba(255, 255, 255, 0.05)`;
      ctx.lineWidth = 1; ctx.stroke();
      if(p.min_rng > 0) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.min_rng, 0, Math.PI*2);
        ctx.strokeStyle = `rgba(255, 100, 100, 0.05)`; ctx.stroke();
      }

      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'; ctx.strokeStyle = p.color; ctx.lineWidth = 2;
      ctx.strokeRect(p.x-25, p.y-30, 50, 55); ctx.fillRect(p.x-25, p.y-30, 50, 55);
      ctx.font = '22px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = 'white';
      ctx.fillText(`${p.icon}${p.s_icon}`, p.x, p.y+10);
      ctx.font = 'bold 10px sans-serif'; ctx.fillText(p.name, p.x, p.y-15);
      
      // Thanh máu chia tỷ lệ 200
      ctx.fillStyle = '#444'; ctx.fillRect(p.x-20, p.y+15, 40, 5);
      ctx.fillStyle = p.hp > 100 ? '#22c55e' : p.hp > 40 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(p.x-20, p.y+15, Math.max(0, (p.hp/200)*40), 5);
    });
  };

  const call = (path, body, method='POST') => fetch(`${URL}${path}`, {
    method, headers: {'Content-Type': 'application/json'}, body: body ? JSON.stringify(body) : null
  }).then(r => r.json());

  const promptText = `Hãy đóng vai một bình luận viên eSports siêu bốc lửa, hài hước và có chuyên môn sâu về kỹ năng lập trình cũng như game auto-battler. 
Dưới đây là toàn bộ diễn biến của trận đấu chung kết vừa diễn ra của team dev chúng tôi. Dựa vào lịch sử này, hãy viết một bài bình luận tổng kết trận đấu thật cháy, vinh danh người chiến thắng và chế giễu vui vẻ những người bị hạ gục sớm!

LỊCH SỬ TRẬN ĐẤU:
${state.logs.join('\n')}

NGƯỜI CHIẾN THẮNG: ${state.winner_info?.name} (Vũ khí: ${state.winner_info?.weapon}, Khiên: ${state.winner_info?.shield}, AI Rule: ${state.winner_info?.strat?.target_rule}, Chiến thuật núp: ${state.winner_info?.strat?.camp_until})
`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-2 md:p-6 font-sans flex flex-col items-center overflow-x-hidden">
      <div className="flex flex-col md:flex-row items-center gap-4 mb-4 md:mb-8 text-center w-full justify-between max-w-7xl">
        <div className="flex items-center gap-4">
            <h1 className="text-3xl md:text-5xl font-black text-yellow-500 uppercase tracking-tighter drop-shadow-md">{state.config?.title || 'ARENA'}</h1>
            <label className="text-[10px] md:text-xs text-slate-500 cursor-pointer border border-slate-800 p-1 md:p-2 rounded hover:text-yellow-500">
            <input type="checkbox" className="hidden" onChange={e => {
                if (e.target.checked && prompt("Pass Host:") === "dev123") setIsHost(true);
                else { e.target.checked = false; setIsHost(false); }
            }} /> ⚙️ HOST
            </label>
        </div>
        <button className="text-xs bg-slate-800 p-2 rounded" onClick={() => {setSoundEnabled(!soundEnabled); if(!soundEnabled) playSFX('slash');}}>
            {soundEnabled ? "🔊 Bật Âm Thanh" : "🔇 Tắt Âm Thanh"}
        </button>
      </div>

      {isHost && state.status === 'waiting' && state.config && (
        <div className="mb-6 p-3 md:p-4 bg-slate-900 border border-yellow-600/30 rounded-xl grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-6xl text-xs md:text-sm">
          <input className="bg-slate-800 p-2 rounded" placeholder="Title" value={state.config.title} onChange={e=>call('/config', {...state.config, title: e.target.value})} />
          <input className="bg-slate-800 p-1 rounded h-full w-full cursor-pointer" type="color" value={state.config.bg} onChange={e=>call('/config', {...state.config, bg: e.target.value})} />
          <div className="flex items-center gap-2">W:<input className="bg-slate-800 p-2 rounded w-full" type="number" value={state.config.w} onChange={e=>call('/config', {...state.config, w: parseInt(e.target.value)})} /></div>
          <div className="flex items-center gap-2">H:<input className="bg-slate-800 p-2 rounded w-full" type="number" value={state.config.h} onChange={e=>call('/config', {...state.config, h: parseInt(e.target.value)})} /></div>
        </div>
      )}

      {state.status === 'waiting' && (
        <div className="max-w-7xl w-full flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-900 p-5 md:p-8 rounded-2xl border border-slate-800 shadow-2xl">
              <h2 className="text-lg md:text-xl font-bold mb-4 md:mb-6 text-blue-400">1. ĐĂNG KÝ</h2>
              <div className="grid gap-4">
                <input className="bg-slate-800 p-3 md:p-4 rounded-xl outline-none focus:ring-2 ring-blue-500" placeholder="Tên nhân vật..." value={reg.name} onChange={e=>setReg({...reg, name:e.target.value})}/>
                <input className="bg-slate-800 p-3 md:p-4 rounded-xl text-xs md:text-sm outline-none" type="password" placeholder="Mật khẩu chiến thuật..." value={reg.password} onChange={e=>setReg({...reg, password:e.target.value})}/>
                <div className="flex gap-3">
                  <select className="bg-slate-800 p-3 flex-1 rounded-xl text-xs md:text-sm" value={reg.weapon} onChange={e=>setReg({...reg, weapon:e.target.value})}>
                    {statsWiki && Object.entries(statsWiki.weapons).map(([k, w]) => <option key={k} value={k}>{w.icon} {w.name}</option>)}
                  </select>
                  <select className="bg-slate-800 p-3 flex-1 rounded-xl text-xs md:text-sm" value={reg.shield} onChange={e=>setReg({...reg, shield:e.target.value})}>
                    {statsWiki && Object.entries(statsWiki.shields).map(([k, s]) => <option key={k} value={k}>{s.icon} {s.name}</option>)}
                  </select>
                </div>
                <button className="mt-2 bg-blue-600 hover:bg-blue-500 font-bold p-4 rounded-xl shadow-lg transition-transform active:scale-95" onClick={()=>call('/register', reg).then(d=>{ if(d.status==='success') setReg({...reg, name:'', password:''}); else alert(d.message); })}>GIA NHẬP ARENA</button>
              </div>
            </div>
            
            <div className="bg-slate-900 p-5 md:p-8 rounded-2xl border border-slate-800 flex flex-col shadow-2xl">
              <div className="flex justify-between items-center mb-4 md:mb-6">
                <h2 className="text-lg md:text-xl font-bold uppercase text-slate-400">PHÒNG CHỜ ({lobby.length})</h2>
                {isHost && <div className="flex gap-2">
                    <button className="bg-green-900/50 text-green-300 hover:bg-green-600 px-2 md:px-3 py-1.5 rounded text-[10px] md:text-xs" onClick={()=>call('/add-bots')}>🤖 +10 BOTS</button>
                    <button className="bg-red-900/50 text-red-300 hover:bg-red-600 px-2 md:px-3 py-1.5 rounded text-[10px] md:text-xs" onClick={()=>call('/reset-all')}>XÓA HẾT</button>
                </div>}
              </div>
              <div className="space-y-2 flex-grow overflow-y-auto max-h-[250px] pr-2">
                {lobby.map(p => (
                  <div key={p.name} className="p-3 bg-slate-800/80 rounded-xl flex justify-between items-center border-l-4" style={{borderColor: p.color}}>
                    <span className="font-medium text-slate-200 text-sm md:text-base">👤 {p.name}</span> 
                    {isHost && <button onClick={()=>call(`/player/${p.name}`, null, 'DELETE')} className="text-red-900 font-bold px-2">×</button>}
                  </div>
                ))}
              </div>
              {isHost && <button className="w-full mt-4 bg-yellow-600 hover:bg-yellow-500 text-black font-black p-4 rounded-xl" onClick={()=>call('/phase-strategy')}>CHỐT SỔ →</button>}
            </div>
          </div>
          
          <div className="bg-slate-900 p-5 md:p-8 rounded-2xl border border-slate-800 shadow-2xl">
            <h2 className="text-sm font-bold text-yellow-500 mb-4 uppercase tracking-widest border-b border-slate-800 pb-3 text-center md:text-left">📖 Bách Khoa Toàn Thư (Luật Chơi)</h2>
            {statsWiki ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs md:text-sm text-slate-400">
                <div className="space-y-2 bg-slate-800/30 p-4 rounded-xl border border-slate-800/50">
                  <h3 className="text-blue-400 font-black mb-3">VŨ KHÍ</h3>
                  {Object.entries(statsWiki.weapons).map(([k, w]) => (<div key={k} className="mb-2 pb-2 border-b border-slate-800 last:border-0"><span className="text-white font-bold">{w.icon} {w.name}</span>: Tầm ({w.min_rng}-{w.rng}) | Đam {w.dmg} | CD {w.cd}s | Nặng {w.wt}<br/><span className="italic text-[10px]">{w.desc}</span></div>))}
                </div>
                <div className="space-y-2 bg-slate-800/30 p-4 rounded-xl border border-slate-800/50">
                  <h3 className="text-green-400 font-black mb-3">KHIÊN GIÁP</h3>
                  {Object.entries(statsWiki.shields).map(([k, s]) => (<div key={k} className="mb-2 pb-2 border-b border-slate-800 last:border-0"><span className="text-white font-bold">{s.icon} {s.name}</span>: Đỡ {s.def}% | Nặng {s.wt}<br/><span className="italic text-[10px]">{s.desc}</span></div>))}
                </div>
                <div className="space-y-3 bg-slate-800/30 p-4 rounded-xl border border-slate-800/50 text-white font-mono text-[11px] md:text-xs">
                  <p>🏃 Tốc độ = 150 - (Nặng VK + Nặng Khiên)</p>
                  <p>🏹 VK Tầm Xa: Sẽ tự động vừa lùi vừa bắn nếu địch áp sát (Thả diều).</p>
                  <p>💥 Khắc hệ = x1.5 Đam</p>
                </div>
              </div>
            ) : <p className="text-center">Loading Wiki...</p>}
          </div>
        </div>
      )}

      {state.status === 'strategy' && (
        <div className="max-w-2xl w-full bg-slate-900 p-5 md:p-10 rounded-3xl border-2 border-purple-500/50 shadow-2xl">
          <div className="text-center mb-6">
            <h2 className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-2">ĐẾM NGƯỢC LẬP CHIẾN THUẬT</h2>
            <div className="text-6xl md:text-8xl font-black text-white tabular-nums tracking-tighter">
              {Math.floor(state.timer / 60)}:{(state.timer % 60).toString().padStart(2, '0')}
            </div>
            {isHost && <button className="mt-4 bg-red-600 hover:bg-red-500 px-6 py-2 rounded-full font-black text-white shadow-lg animate-pulse" onClick={()=>call('/start-now')}>🚀 BỎ QUA ĐẾM NGƯỢC (RANDOM AI CÒN LẠI)</button>}
          </div>
          <div className="space-y-4">
            <input className="w-full bg-slate-800 p-4 rounded-xl border border-slate-700 outline-none" placeholder="Tên của bạn..." value={strat.name} onChange={e=>setStrat({...strat, name:e.target.value})}/>
            <input className="w-full bg-slate-800 p-4 rounded-xl border border-slate-700 outline-none" type="password" placeholder="Mật khẩu bảo vệ..." value={strat.password} onChange={e=>setStrat({...strat, password:e.target.value})}/>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <select className="w-full bg-slate-800 p-4 rounded-xl text-xs md:text-sm" value={strat.target_rule} onChange={e=>setStrat({...strat, target_rule:e.target.value})}>
                <option value="closest">Gần nhất</option><option value="lowest_hp">Yếu máu nhất</option><option value="highest_hp">Trâu nhất</option><option value="counter">Khắc hệ</option>
              </select>
              <select className="w-full bg-slate-800 p-4 rounded-xl text-xs md:text-sm" value={strat.camp_until} onChange={e=>setStrat({...strat, camp_until:parseInt(e.target.value)})}>
                <option value="99">Đánh luôn</option><option value="5">Núp Top 5</option><option value="3">Núp Top 3</option><option value="2">Núp tới Chung Kết</option>
              </select>
            </div>
            <button className="w-full mt-4 bg-purple-600 hover:bg-purple-500 font-black text-white p-5 rounded-2xl shadow-xl transition-all active:scale-95" onClick={()=>call('/update-strategy', strat).then(d=> alert(d.status==='success' ? "ĐÃ KHÓA CHIẾN THUẬT!" : d.message))}>KHÓA CHIẾN THUẬT</button>
          </div>
        </div>
      )}

      {(state.status === 'playing' || state.status === 'finished') && state.config && (
        <div className="flex flex-col lg:flex-row gap-4 w-full max-w-7xl justify-center items-center lg:items-start">
          <div className="w-full lg:max-w-max flex flex-col gap-4 relative">
            <div className="relative bg-black rounded-2xl md:rounded-3xl border-4 md:border-[6px] border-slate-800 shadow-2xl overflow-hidden w-full">
              <canvas ref={canvasRef} width={state.config.w} height={state.config.h} className="w-full h-auto block" style={{ aspectRatio: `${state.config.w} / ${state.config.h}` }} />
              {state.status === 'finished' && (
                <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
                  <h2 className="text-4xl md:text-7xl font-black text-yellow-500 mb-2 italic tracking-tighter">WINNER</h2>
                  <div className="text-3xl md:text-5xl font-bold mb-6 text-white uppercase border-b-4 border-yellow-500 pb-2">{state.winner_info?.name}</div>
                  {isHost && (
                    <div className="mt-8 flex flex-col sm:flex-row gap-3">
                        <button className="bg-blue-600 hover:bg-blue-500 px-8 py-3 rounded-full font-black text-white" onClick={()=>call('/rematch')}>TÁI ĐẤU</button>
                        <button className="bg-red-900 px-6 py-3 rounded-full font-bold text-xs" onClick={()=>call('/reset-all')}>XÓA HẾT</button>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* PANEL XUẤT LỊCH SỬ KHI GAME KẾT THÚC */}
            {state.status === 'finished' && isHost && (
              <div className="bg-slate-900 p-4 md:p-6 rounded-2xl border border-slate-800 w-full">
                <h3 className="font-bold text-yellow-500 mb-2 uppercase text-xs">🎙️ XUẤT LỊCH SỬ CHO BÌNH LUẬN VIÊN AI</h3>
                <p className="text-[10px] text-slate-400 mb-2">Copy đoạn Text dưới đây ném vào ChatGPT/Gemini để có một bản bình luận tóm tắt trận đấu siêu hài hước cho cả team!</p>
                <textarea readOnly className="w-full bg-black text-slate-300 p-3 rounded text-[10px] h-32 outline-none font-mono custom-scrollbar" value={promptText}></textarea>
                <button className="mt-2 w-full bg-slate-700 hover:bg-slate-600 text-xs py-2 rounded font-bold" onClick={()=>{navigator.clipboard.writeText(promptText); alert("Đã Copy Báo Cáo!");}}>📋 COPY BÁO CÁO</button>
              </div>
            )}
          </div>

          <div className="bg-slate-900 p-4 md:p-6 rounded-2xl w-full lg:max-w-xs flex flex-col border border-slate-800 shadow-xl h-[250px] lg:h-auto" style={{ lg: { height: state.config.h + 12 } }}>
             <h3 className="font-bold text-red-500 mb-2 uppercase text-center text-[10px] tracking-widest opacity-80">DIỄN BIẾN TRẬN ĐẤU</h3>
             <div className="flex-grow overflow-auto space-y-2 flex flex-col-reverse font-mono text-[10px] md:text-[11px] leading-relaxed pr-1 custom-scrollbar">
                {[...(state.logs || [])].reverse().map((l, i) => <div key={i} className={`p-2 rounded-lg border-l-4 ${l.includes('💀') || l.includes('🏆') ? 'bg-red-950/40 border-red-600 text-red-200' : 'bg-slate-800/80 border-slate-600 text-slate-300'}`}>{l}</div>)}
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;