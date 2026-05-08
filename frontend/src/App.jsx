import React, { useState, useEffect, useRef } from 'react';

const URL = `http://${window.location.hostname}:8000`;
const WS = `ws://${window.location.hostname}:8000/ws`;

function App() {
  const [lobby, setLobby] = useState([]);
  const [state, setState] = useState({ status: 'waiting', players: [], logs: [], timer: 0, config: {title:'ARENA', bg:'#0f172a', w:800, h:600} });
  const [reg, setReg] = useState({ name: '', password: '', weapon: 'sword', shield: 'wood_shield' });
  const [strat, setStrat] = useState({ name: '', password: '', target_rule: 'closest', camp_until: 99 });
  const [isHost, setIsHost] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    const fetchLobby = () => fetch(`${URL}/lobby`).then(r => r.json()).then(d => setLobby(Array.isArray(d) ? d : [])).catch(() => {});
    fetchLobby(); const inv = setInterval(fetchLobby, 2000);
    const socket = new WebSocket(WS);
    socket.onmessage = (e) => {
      const data = JSON.parse(e.data); setState(data);
      if (data.status === 'playing') draw(data);
    };
    return () => { clearInterval(inv); socket.close(); };
  }, []);

  const draw = (data) => {
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = data.config.bg; ctx.fillRect(0, 0, data.config.w, data.config.h);
    data.particles?.forEach(p => {
      ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2);
      ctx.strokeStyle = p.c; ctx.lineWidth = 3; ctx.stroke();
    });
    data.players?.forEach(p => {
      if (p.hp <= 0) return;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'; ctx.strokeStyle = p.color;
      ctx.strokeRect(p.x-25, p.y-30, 50, 55); ctx.fillRect(p.x-25, p.y-30, 50, 55);
      ctx.font = '20px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = 'white';
      ctx.fillText(`${p.icon}${p.s_icon}`, p.x, p.y+10);
      ctx.font = '10px Arial'; ctx.fillText(p.name, p.x, p.y-15);
      ctx.fillStyle = '#444'; ctx.fillRect(p.x-20, p.y+15, 40, 4);
      ctx.fillStyle = '#22c55e'; ctx.fillRect(p.x-20, p.y+15, 40 * (p.hp/100), 4);
    });
  };

  const call = (path, body, method='POST') => fetch(`${URL}${path}`, {
    method, headers: {'Content-Type': 'application/json'},
    body: body ? JSON.stringify(body) : null
  }).then(r => r.json());

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 font-sans flex flex-col items-center">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-3xl font-black text-yellow-500 uppercase">{state.config.title}</h1>
        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
          <input type="checkbox" checked={isHost} onChange={e => {
            if (e.target.checked && prompt("Pass Host:") === "dev123") setIsHost(true);
            else setIsHost(false);
          }} /> Host
        </label>
      </div>

      {isHost && state.status === 'waiting' && (
        <div className="mb-6 p-4 bg-slate-800 border border-yellow-500 rounded-xl grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl">
          <input className="bg-slate-700 p-2 rounded text-xs" value={state.config.title} onChange={e=>call('/config', {...state.config, title: e.target.value})} />
          <input className="bg-slate-700 p-2 rounded h-8" type="color" value={state.config.bg} onChange={e=>call('/config', {...state.config, bg: e.target.value})} />
          <input className="bg-slate-700 p-2 rounded text-xs" type="number" value={state.config.w} onChange={e=>call('/config', {...state.config, w: parseInt(e.target.value)})} />
          <input className="bg-slate-700 p-2 rounded text-xs" type="number" value={state.config.h} onChange={e=>call('/config', {...state.config, h: parseInt(e.target.value)})} />
        </div>
      )}

      {state.status === 'waiting' && (
        <div className="max-w-4xl w-full grid md:grid-cols-2 gap-6">
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
            <h2 className="text-xl font-bold mb-4 text-blue-400">1. Đăng Ký</h2>
            <div className="grid gap-4">
              <input className="bg-slate-700 p-2 rounded" placeholder="Tên..." value={reg.name} onChange={e=>setReg({...reg, name:e.target.value})}/>
              <input className="bg-slate-700 p-2 rounded text-xs" type="password" placeholder="Mật khẩu chiến thuật..." value={reg.password} onChange={e=>setReg({...reg, password:e.target.value})}/>
              <div className="flex gap-2">
                <select className="bg-slate-700 p-2 flex-1 rounded text-xs" value={reg.weapon} onChange={e=>setReg({...reg, weapon:e.target.value})}>
                  <option value="dagger">🗡️ Dao (Nhanh)</option><option value="sword">🤺 Kiếm</option><option value="spear">🔱 Giáo</option>
                  <option value="bow">🏹 Cung</option><option value="magic">🪄 Phép</option><option value="hammer">🔨 Búa (Chậm/Mạnh)</option>
                </select>
                <select className="bg-slate-700 p-2 flex-1 rounded text-xs" value={reg.shield} onChange={e=>setReg({...reg, shield:e.target.value})}>
                  <option value="buckler">🥏 Khiên nhỏ</option><option value="magic_ward">🔮 Khiên phép</option><option value="wood_shield">🪵 Khiên gỗ</option>
                  <option value="steel_shield">🛡️ Khiên thép</option><option value="tower_shield">🧱 Khiên tháp (Rất nặng)</option>
                </select>
              </div>
              <button className="bg-blue-600 font-bold p-3 rounded" onClick={()=>call('/register', reg).then(d=>{ if(d.status==='success') setReg({...reg, name:'', password:''}); else alert(d.message); })}>Vào Sảnh</button>
            </div>
          </div>
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
            <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold uppercase">Phòng Chờ ({lobby.length})</h2></div>
            <div className="space-y-1 h-48 overflow-auto border-t border-slate-700 pt-2 text-sm">
              {lobby.map(p => <div key={p.name} className="p-2 bg-slate-700 rounded flex justify-between">
                <span>👤 {p.name}</span> {isHost && <button onClick={()=>call(`/player/${p.name}`, null, 'DELETE')} className="text-red-500">×</button>}
              </div>)}
            </div>
            {isHost && <button className="w-full mt-4 bg-yellow-600 text-black font-bold p-3 rounded" onClick={()=>call('/phase-strategy')}>Chốt Danh Sách →</button>}
          </div>
        </div>
      )}

      {state.status === 'strategy' && (
        <div className="max-w-2xl w-full bg-slate-800 p-8 rounded-2xl border-2 border-purple-500 shadow-2xl">
          <div className="text-center mb-6"><h2 className="text-xs font-bold text-purple-300 uppercase mb-1">Thời gian còn lại</h2><div className="text-5xl font-black text-white">{state.timer}s</div></div>
          <div className="space-y-4">
            <input className="w-full bg-slate-700 p-3 rounded" placeholder="Tên bạn..." value={strat.name} onChange={e=>setStrat({...strat, name:e.target.value})}/>
            <input className="w-full bg-slate-700 p-3 rounded" type="password" placeholder="Mật khẩu chiến thuật..." value={strat.password} onChange={e=>setStrat({...strat, password:e.target.value})}/>
            <select className="w-full bg-slate-700 p-3 rounded" value={strat.target_rule} onChange={e=>setStrat({...strat, target_rule:e.target.value})}>
              <option value="closest">Gần nhất</option><option value="lowest_hp">Yếu máu nhất</option><option value="highest_hp">Trâu nhất</option><option value="counter">Khắc hệ</option>
            </select>
            <select className="w-full bg-slate-700 p-3 rounded" value={strat.camp_until} onChange={e=>setStrat({...strat, camp_until:parseInt(e.target.value)})}>
              <option value="99">Đánh luôn</option><option value="5">Núp tới Top 5</option><option value="3">Núp tới Top 3</option><option value="2">Núp tới Top 2</option>
            </select>
            <button className="w-full bg-purple-600 font-bold p-4 rounded-xl" onClick={()=>call('/update-strategy', strat).then(d=> alert(d.status==='success' ? "Đã khóa!" : d.message))}>Khóa Bí Mật</button>
          </div>
        </div>
      )}

      {(state.status === 'playing' || state.status === 'finished') && (
        <div className="flex flex-col md:flex-row gap-6 w-full max-w-7xl justify-center items-start">
          <div className="relative bg-black rounded-lg border-4 border-slate-700 shadow-2xl overflow-hidden">
            <canvas ref={canvasRef} width={state.config.w} height={state.config.h} />
            {state.status === 'finished' && (
              <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center p-6 text-center">
                <h2 className="text-5xl font-black text-yellow-500 mb-2 italic">WINNER</h2>
                <div className="text-4xl font-bold mb-6 text-white uppercase">{state.winner_info?.name}</div>
                <div className="bg-slate-800 p-6 rounded-xl border-2 border-yellow-500 text-left text-sm space-y-2">
                    <p>⚔️ Vũ khí: {state.winner_info?.weapon} | 🛡️ Khiên: {state.winner_info?.shield}</p>
                    <p className="text-yellow-500 font-bold">🎯 AI: {state.winner_info?.strat.target_rule} | 🌿 Núp: Top {state.winner_info?.strat.camp_until}</p>
                </div>
                {isHost && <button className="mt-8 bg-blue-600 px-10 py-3 rounded-full font-bold" onClick={()=>call('/reset')}>Giải Mới</button>}
              </div>
            )}
          </div>
          <div className="bg-slate-800 p-4 rounded-lg w-full max-w-sm flex flex-col border border-slate-700" style={{height: state.config.h}}>
             <h3 className="font-bold text-red-500 mb-2 uppercase text-center text-xs tracking-widest">Bình Luận</h3>
             <div className="flex-grow overflow-auto space-y-2 flex flex-col-reverse text-[11px] font-mono italic">
                {[...(state.logs || [])].reverse().map((l, i) => <div key={i} className="p-2 bg-slate-900 rounded border-l-2 border-slate-600">{l}</div>)}
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;