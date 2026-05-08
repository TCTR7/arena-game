import React, { useState, useEffect, useRef } from 'react';

const URL = `http://${window.location.hostname}:8000`;
const WS = `ws://${window.location.hostname}:8000/ws`;

function App() {
  const [lobby, setLobby] = useState([]);
  const [statsWiki, setStatsWiki] = useState(null);
  const [state, setState] = useState({ status: 'waiting', players: [], logs: [], timer: 0, config: {title:'ARENA', bg:'#0f172a', w:800, h:600} });
  const [reg, setReg] = useState({ name: '', password: '', weapon: 'sword', shield: 'wood_shield' });
  const [strat, setStrat] = useState({ name: '', password: '', target_rule: 'closest', camp_until: 99 });
  const [isHost, setIsHost] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    fetch(`${URL}/stats`).then(r=>r.json()).then(setStatsWiki).catch(console.error);
    const fetchLobby = () => fetch(`${URL}/lobby`).then(r => r.json()).then(d => setLobby(Array.isArray(d) ? d : [])).catch(() => setLobby([]));
    fetchLobby(); const inv = setInterval(fetchLobby, 2000);
    
    const socket = new WebSocket(WS);
    socket.onmessage = (e) => {
      const data = JSON.parse(e.data); setState(data);
      if (data.status === 'playing') draw(data);
    };
    return () => { clearInterval(inv); socket.close(); };
  }, []);

  const draw = (data) => {
    const ctx = canvasRef.current?.getContext('2d'); 
    if (!ctx || !data.config) return;
    
    ctx.fillStyle = data.config.bg; ctx.fillRect(0, 0, data.config.w, data.config.h);
    
    data.particles?.forEach(p => {
      ctx.strokeStyle = p.c; ctx.lineWidth = 3; ctx.beginPath();
      if (p.type === 'slash') ctx.arc(p.x1, p.y1, 40, Math.atan2(p.y2-p.y1, p.x2-p.x1)-0.5, Math.atan2(p.y2-p.y1, p.x2-p.x1)+0.5);
      else if (p.type === 'thrust') { ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.lineWidth=1; }
      else if (p.type === 'arrow') { ctx.setLineDash([10,5]); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); }
      else if (p.type === 'magic') { ctx.lineWidth=5; ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke(); ctx.beginPath(); ctx.arc(p.x2, p.y2, 15, 0, Math.PI*2); }
      else if (p.type === 'bash') { ctx.lineWidth=8; ctx.arc(p.x2, p.y2, 30, 0, Math.PI*2); }
      ctx.stroke(); ctx.setLineDash([]);
    });

    data.players?.forEach(p => {
      if (p.hp <= 0) return;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'; ctx.strokeStyle = p.color; ctx.lineWidth = 2;
      ctx.strokeRect(p.x-25, p.y-30, 50, 55); ctx.fillRect(p.x-25, p.y-30, 50, 55);
      ctx.font = '22px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = 'white';
      ctx.fillText(`${p.icon}${p.s_icon}`, p.x, p.y+10);
      ctx.font = '10px Arial'; ctx.fillText(p.name, p.x, p.y-15);
      ctx.fillStyle = '#444'; ctx.fillRect(p.x-20, p.y+15, 40, 5);
      ctx.fillStyle = p.hp > 100 ? '#22c55e' : p.hp > 40 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(p.x-20, p.y+15, Math.max(0, (p.hp/200)*40), 5);
    });
  };

  const call = (path, body, method='POST') => fetch(`${URL}${path}`, {
    method, headers: {'Content-Type': 'application/json'}, body: body ? JSON.stringify(body) : null
  }).then(r => r.json());

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-2 md:p-6 font-sans flex flex-col items-center overflow-x-hidden">
      <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 mb-4 md:mb-8 text-center">
        <h1 className="text-3xl md:text-5xl font-black text-yellow-500 uppercase tracking-tighter drop-shadow-md">{state.config?.title || 'ARENA'}</h1>
        <label className="text-[10px] md:text-xs text-slate-500 cursor-pointer border border-slate-800 p-1 md:p-2 rounded hover:text-yellow-500 transition">
          <input type="checkbox" className="hidden" onChange={e => {
            if (e.target.checked && prompt("Pass Host:") === "dev123") setIsHost(true);
            else setIsHost(false);
          }} /> ⚙️ HOST
        </label>
      </div>

      {isHost && state.status === 'waiting' && state.config && (
        <div className="mb-6 p-3 md:p-4 bg-slate-900 border border-yellow-600/30 rounded-xl grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-6xl text-xs md:text-sm">
          <input className="bg-slate-800 p-2 rounded" placeholder="Tên giải đấu" value={state.config.title} onChange={e=>call('/config', {...state.config, title: e.target.value})} />
          <input className="bg-slate-800 p-1 rounded h-full w-full cursor-pointer" type="color" value={state.config.bg} onChange={e=>call('/config', {...state.config, bg: e.target.value})} />
          <div className="flex items-center gap-2">W:<input className="bg-slate-800 p-2 rounded w-full" type="number" value={state.config.w} onChange={e=>call('/config', {...state.config, w: parseInt(e.target.value)})} /></div>
          <div className="flex items-center gap-2">H:<input className="bg-slate-800 p-2 rounded w-full" type="number" value={state.config.h} onChange={e=>call('/config', {...state.config, h: parseInt(e.target.value)})} /></div>
        </div>
      )}

      {state.status === 'waiting' && (
        <div className="max-w-6xl w-full flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-900 p-5 md:p-8 rounded-2xl border border-slate-800 shadow-2xl">
              <h2 className="text-lg md:text-xl font-bold mb-4 md:mb-6 text-blue-400">1. ĐĂNG KÝ CHIẾN BINH</h2>
              <div className="grid gap-4">
                <input className="bg-slate-800 p-3 md:p-4 rounded-xl outline-none focus:ring-2 ring-blue-500 text-sm md:text-base" placeholder="Tên nhân vật..." value={reg.name} onChange={e=>setReg({...reg, name:e.target.value})}/>
                <input className="bg-slate-800 p-3 md:p-4 rounded-xl text-sm md:text-base outline-none focus:ring-2 ring-blue-500" type="password" placeholder="Mật khẩu bảo vệ chiến thuật..." value={reg.password} onChange={e=>setReg({...reg, password:e.target.value})}/>
                <div className="flex flex-col sm:flex-row gap-3">
                  <select className="bg-slate-800 p-3 md:p-4 flex-1 rounded-xl text-xs md:text-sm" value={reg.weapon} onChange={e=>setReg({...reg, weapon:e.target.value})}>
                    {statsWiki && Object.entries(statsWiki.weapons).map(([k, w]) => <option key={k} value={k}>{w.icon} {w.name}</option>)}
                  </select>
                  <select className="bg-slate-800 p-3 md:p-4 flex-1 rounded-xl text-xs md:text-sm" value={reg.shield} onChange={e=>setReg({...reg, shield:e.target.value})}>
                    {statsWiki && Object.entries(statsWiki.shields).map(([k, s]) => <option key={k} value={k}>{s.icon} {s.name}</option>)}
                  </select>
                </div>
                <button className="mt-2 bg-blue-600 hover:bg-blue-500 font-bold p-4 rounded-xl shadow-lg transition-transform active:scale-95 text-sm md:text-base" onClick={()=>call('/register', reg).then(d=>{ if(d.status==='success') setReg({...reg, name:'', password:''}); else alert(d.message); })}>
                  GIA NHẬP SẢNH
                </button>
              </div>
            </div>

            <div className="bg-slate-900 p-5 md:p-8 rounded-2xl border border-slate-800 flex flex-col shadow-2xl">
              <div className="flex justify-between items-center mb-4 md:mb-6">
                <h2 className="text-lg md:text-xl font-bold uppercase text-slate-400">PHÒNG CHỜ ({lobby.length})</h2>
                {isHost && (
                  <div className="flex gap-2">
                    {/* NÚT THÊM BOT SIÊU TỐC */}
                    <button className="bg-green-900/50 text-green-300 hover:bg-green-600 hover:text-white text-[10px] md:text-xs px-2 md:px-3 py-1.5 rounded transition" onClick={()=>call('/add-bots')}>🤖 +10 BOTS</button>
                    <button className="bg-red-900/50 text-red-300 hover:bg-red-600 hover:text-white text-[10px] md:text-xs px-2 md:px-3 py-1.5 rounded transition" onClick={()=>call('/reset-all')}>Xóa Hết</button>
                  </div>
                )}
              </div>
              <div className="space-y-2 flex-grow overflow-y-auto max-h-[250px] md:max-h-[300px] pr-2 custom-scrollbar">
                {lobby.length === 0 && <p className="text-xs text-slate-600 text-center mt-10">Chưa có anh em nào tham gia...</p>}
                {lobby.map(p => (
                  <div key={p.name} className="p-3 bg-slate-800/80 rounded-xl flex justify-between items-center group">
                    <span className="font-medium text-slate-200 text-sm md:text-base">👤 {p.name}</span> 
                    {isHost && <button onClick={()=>call(`/player/${p.name}`, null, 'DELETE')} className="text-red-900 group-hover:text-red-500 font-bold text-lg px-2">×</button>}
                  </div>
                ))}
              </div>
              {isHost && <button className="w-full mt-4 bg-yellow-600 hover:bg-yellow-500 text-black font-black p-4 rounded-xl shadow-lg transition-transform active:scale-95" onClick={()=>call('/phase-strategy')}>CHỐT SỔ TỚI PHASE 2 →</button>}
            </div>
          </div>

          <div className="bg-slate-900 p-5 md:p-8 rounded-2xl border border-slate-800 shadow-2xl w-full">
            <h2 className="text-sm font-bold text-yellow-500 mb-4 uppercase tracking-widest border-b border-slate-800 pb-3 text-center md:text-left">📖 Bách Khoa Toàn Thư (Luật Chơi)</h2>
            {statsWiki ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 text-xs md:text-sm text-slate-400">
                <div className="space-y-2 bg-slate-800/30 p-4 rounded-xl border border-slate-800/50">
                  <h3 className="text-blue-400 font-black mb-3 text-sm">VŨ KHÍ ĐÁNH GẦN & XA</h3>
                  {Object.entries(statsWiki.weapons).map(([k, w]) => (
                    <div key={k} className="mb-2 pb-2 border-b border-slate-800/50 last:border-0">
                      <span className="text-white font-bold">{w.icon} {w.name}</span> 
                      <div className="text-[10px] md:text-xs mt-1">Sát thương: {w.dmg} | Đánh mỗi: {w.cd}s | Độ Nặng: {w.wt}</div>
                      <div className="italic text-[10px] text-slate-500">{w.desc}</div>
                    </div>
                  ))}
                </div>
                
                <div className="space-y-2 bg-slate-800/30 p-4 rounded-xl border border-slate-800/50">
                  <h3 className="text-green-400 font-black mb-3 text-sm">KHIÊN CHẮN (GIÁP)</h3>
                  {Object.entries(statsWiki.shields).map(([k, s]) => (
                    <div key={k} className="mb-2 pb-2 border-b border-slate-800/50 last:border-0">
                      <span className="text-white font-bold">{s.icon} {s.name}</span>
                      <div className="text-[10px] md:text-xs mt-1">Đỡ Đòn: {s.def}% | Độ Nặng: {s.wt}</div>
                      <div className="italic text-[10px] text-slate-500">{s.desc}</div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                    <h3 className="text-red-400 font-black mb-2 text-sm">TỐC ĐỘ DI CHUYỂN</h3>
                    <p className="mb-2">Anh em cầm đồ càng nặng thì đi càng lết. Đồ nhẹ đi nhanh dễ né skill.</p>
                    <code className="text-[10px] md:text-xs text-yellow-200 bg-black p-1 rounded block">Tốc độ = 150 - (Nặng VK + Nặng Khiên)</code>
                  </div>
                  <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                    <h3 className="text-purple-400 font-black mb-2 text-sm">CƠ CHẾ KHẮC HỆ (x1.5 Đam)</h3>
                    <ul className="space-y-1 text-[10px] md:text-xs">
                      <li><span className="text-white">🗡️ Dao găm</span> khắc <span className="text-white">🔮Phép / 🪵Gỗ</span></li>
                      <li><span className="text-white">🤺 Kiếm</span> khắc <span className="text-white">🪵Gỗ / 🥏Nhỏ</span></li>
                      <li><span className="text-white">🔱 Giáo</span> khắc <span className="text-white">🛡️Thép / 🪵Gỗ</span></li>
                      <li><span className="text-white">🏹 Cung</span> khắc <span className="text-white">🔮Phép / 🥏Nhỏ</span></li>
                      <li><span className="text-white">🪄 Phép</span> khắc <span className="text-white">🛡️Thép / 🧱Tháp</span></li>
                      <li><span className="text-white">🔨 Búa tạ</span> khắc <span className="text-white">🧱Tháp / 🛡️Thép</span></li>
                    </ul>
                  </div>
                </div>
              </div>
            ) : <p className="text-center text-sm">Đang tải Tàng Kinh Các...</p>}
          </div>
        </div>
      )}

      {state.status === 'strategy' && (
        <div className="max-w-2xl w-full bg-slate-900 p-5 md:p-10 rounded-3xl border-2 border-purple-500/50 shadow-2xl">
          <div className="text-center mb-6 md:mb-10">
            <h2 className="text-[10px] md:text-xs font-bold text-purple-400 uppercase tracking-[0.2em] mb-2">THỜI GIAN CÒN LẠI</h2>
            <div className="text-6xl md:text-8xl font-black text-white tabular-nums tracking-tighter drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]">
              {Math.floor(state.timer / 60)}:{(state.timer % 60).toString().padStart(2, '0')}
            </div>
          </div>
          <div className="space-y-4 md:space-y-6">
            <input className="w-full bg-slate-800 p-4 rounded-xl border border-slate-700 text-sm md:text-base outline-none focus:border-purple-500" placeholder="Tên của bạn..." value={strat.name} onChange={e=>setStrat({...strat, name:e.target.value})}/>
            <input className="w-full bg-slate-800 p-4 rounded-xl border border-slate-700 text-sm md:text-base outline-none focus:border-purple-500" type="password" placeholder="Mật khẩu bảo vệ..." value={strat.password} onChange={e=>setStrat({...strat, password:e.target.value})}/>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1 md:space-y-2">
                <label className="text-[10px] md:text-xs font-bold text-slate-400 uppercase ml-1">Ưu tiên tấn công</label>
                <select className="w-full bg-slate-800 p-4 rounded-xl text-xs md:text-sm" value={strat.target_rule} onChange={e=>setStrat({...strat, target_rule:e.target.value})}>
                  <option value="closest">Đứa Gần nhất</option><option value="lowest_hp">Đứa Yếu máu nhất (Ăn hôi)</option><option value="highest_hp">Đứa Trâu nhất (Phá Tank)</option><option value="counter">Đứa bị mình Khắc hệ</option>
                </select>
              </div>
              <div className="space-y-1 md:space-y-2">
                <label className="text-[10px] md:text-xs font-bold text-slate-400 uppercase ml-1">Kế hoạch sinh tồn</label>
                <select className="w-full bg-slate-800 p-4 rounded-xl text-xs md:text-sm" value={strat.camp_until} onChange={e=>setStrat({...strat, camp_until:parseInt(e.target.value)})}>
                  <option value="99">Khô máu ngay từ đầu</option><option value="5">Núp né giao tranh tới Top 5</option><option value="3">Núp tới Top 3</option><option value="2">Núp tới Top 2 (Chung Kết)</option>
                </select>
              </div>
            </div>
            <button className="w-full mt-4 bg-purple-600 hover:bg-purple-500 font-black text-white p-5 rounded-2xl shadow-[0_10px_20px_rgba(147,51,234,0.3)] transition-transform active:scale-95 text-sm md:text-base" onClick={()=>call('/update-strategy', strat).then(d=> alert(d.status==='success' ? "ĐÃ KHÓA CHIẾN THUẬT CHO TRẬN NÀY!" : d.message))}>
              LƯU BÍ MẬT & SẴN SÀNG
            </button>
          </div>
        </div>
      )}

      {(state.status === 'playing' || state.status === 'finished') && state.config && (
        <div className="flex flex-col lg:flex-row gap-4 md:gap-8 w-full max-w-7xl justify-center items-center lg:items-start">
          <div className="w-full lg:max-w-max relative bg-black rounded-2xl md:rounded-3xl border-4 md:border-[6px] border-slate-800 shadow-2xl overflow-hidden flex-shrink-0">
            <canvas ref={canvasRef} width={state.config.w} height={state.config.h} className="w-full h-auto max-w-full block bg-black" style={{ aspectRatio: `${state.config.w} / ${state.config.h}` }} />
            
            {state.status === 'finished' && (
              <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 md:p-12 text-center">
                <h2 className="text-4xl md:text-7xl font-black text-yellow-500 mb-2 italic">CHAMPION</h2>
                <div className="text-3xl md:text-5xl font-bold mb-6 md:mb-10 text-white uppercase">{state.winner_info?.name}</div>
                <div className="bg-slate-900 p-4 md:p-8 rounded-xl md:rounded-3xl border border-yellow-500/50 text-left space-y-2 md:space-y-3 shadow-2xl text-xs md:text-base">
                    <p className="font-medium text-slate-200">⚔️ {state.winner_info?.weapon} <span className="mx-2">|</span> 🛡️ {state.winner_info?.shield}</p>
                    <hr className="border-slate-800 my-2" />
                    <p className="text-yellow-500 font-mono">🎯 AI: {state.winner_info?.strat.target_rule}</p>
                    <p className="text-yellow-500 font-mono">🌿 Núp: Top {state.winner_info?.strat.camp_until}</p>
                </div>
                {isHost && (
                  <div className="mt-6 md:mt-12 flex flex-col sm:flex-row gap-3 md:gap-4 w-full justify-center">
                      <button className="bg-blue-600 hover:bg-blue-500 px-6 md:px-10 py-3 md:py-4 rounded-full font-black text-sm md:text-lg shadow-2xl" onClick={()=>call('/rematch')}>TÁI ĐẤU (Giữ Team)</button>
                      <button className="bg-red-900 hover:bg-red-700 px-4 md:px-6 py-3 md:py-4 rounded-full font-bold text-xs md:text-sm shadow-xl" onClick={()=>call('/reset-all')}>XÓA ĐÁNH LẠI</button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-slate-900 p-4 md:p-6 rounded-2xl md:rounded-3xl w-full lg:max-w-xs flex flex-col border border-slate-800 shadow-xl h-[300px] lg:h-auto" style={{ lg: { height: state.config.h + 12 } }}>
             <h3 className="font-bold text-red-500 mb-2 md:mb-4 uppercase text-center text-[10px] md:text-xs tracking-widest opacity-80">BÌNH LUẬN TRỰC TIẾP</h3>
             <div className="flex-grow overflow-auto space-y-2 md:space-y-3 flex flex-col-reverse font-mono text-[10px] md:text-[11px] leading-relaxed pr-1">
                {[...(state.logs || [])].reverse().map((l, i) => <div key={i} className={`p-2 md:p-3 rounded-lg md:rounded-xl border-l-4 ${l.includes('💀') ? 'bg-red-950/40 border-red-600 text-red-200' : 'bg-slate-800/80 border-slate-600 text-slate-300'}`}>{l}</div>)}
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;