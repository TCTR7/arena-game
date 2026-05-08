import React, { useState, useEffect, useRef } from 'react';

const URL = `http://${window.location.hostname}:8000`;
const WS = `ws://${window.location.hostname}:8000/ws`;

function App() {
  const [lobby, setLobby] = useState([]);
  const [state, setState] = useState({ status: 'waiting', players: [], logs: [], ready_count: 0, timer: 0, config: {title:'Arena', bg:'#0f172a', w:800, h:600} });
  const [reg, setReg] = useState({ name: '', weapon: 'sword', shield: 'wood_shield' });
  const [strat, setStrat] = useState({ name: '', target_rule: 'closest', camp_until: 99 });
  const [isHost, setIsHost] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    const fetchLobby = () => fetch(`${URL}/lobby`).then(r => r.json()).then(setLobby).catch(() => {});
    fetchLobby();
    const inv = setInterval(fetchLobby, 2000);
    const socket = new WebSocket(WS);
    socket.onmessage = (e) => {
      const data = JSON.parse(e.data); setState(data);
      if (data.status === 'playing') draw(data);
    };
    return () => { clearInterval(inv); socket.close(); };
  }, []);

  const draw = (data) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = data.config.bg; ctx.fillRect(0, 0, data.config.w, data.config.h);
    data.particles?.forEach(p => {
      ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2);
      ctx.strokeStyle = p.c; ctx.lineWidth = 3; ctx.setLineDash([5,5]); ctx.stroke(); ctx.setLineDash([]);
    });
    data.players?.forEach(p => {
      if (p.hp <= 0) return;
      ctx.fillStyle = 'rgba(30, 41, 59, 0.9)'; ctx.strokeStyle = p.color;
      ctx.strokeRect(p.x - 25, p.y - 30, 50, 55); ctx.fillRect(p.x - 25, p.y - 30, 50, 55);
      ctx.font = '20px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = 'white';
      ctx.fillText(`${p.icon}${p.s_icon}`, p.x, p.y + 10);
      ctx.font = '10px Arial'; ctx.fillText(p.name, p.x, p.y - 15);
      ctx.fillStyle = '#444'; ctx.fillRect(p.x - 20, p.y + 15, 40, 4);
      ctx.fillStyle = '#22c55e'; ctx.fillRect(p.x - 20, p.y + 15, 40 * (p.hp/100), 4);
    });
  };

  const call = (path, body, method='POST') => fetch(`${URL}${path}`, {
    method, headers: {'Content-Type': 'application/json'},
    body: body ? JSON.stringify(body) : null
  });

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 font-sans flex flex-col items-center">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-3xl font-black text-yellow-500 uppercase">{state.config.title}</h1>
        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer hover:text-yellow-500">
          <input type="checkbox" checked={isHost} onChange={(e) => {
              if (e.target.checked) {
                if (prompt("Mã bí mật (dev123):") === "dev123") setIsHost(true);
                else alert("Sai mã!");
              } else setIsHost(false);
          }} /> Host
        </label>
      </div>

      {isHost && state.status === 'waiting' && (
        <div className="mb-6 p-4 bg-slate-800 border border-yellow-500/50 rounded-xl grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl">
          <input className="bg-slate-700 p-2 rounded text-sm" placeholder="Tên trận..." value={state.config.title} onChange={e=>call('/config', {...state.config, title: e.target.value})} />
          <input className="bg-slate-700 p-2 rounded text-sm h-full" type="color" value={state.config.bg} onChange={e=>call('/config', {...state.config, bg: e.target.value})} />
          <div className="flex gap-1 items-center"><span className="text-xs">W:</span><input className="bg-slate-700 p-1 rounded text-sm w-full" type="number" value={state.config.w} onChange={e=>call('/config', {...state.config, w: parseInt(e.target.value)})} /></div>
          <div className="flex gap-1 items-center"><span className="text-xs">H:</span><input className="bg-slate-700 p-1 rounded text-sm w-full" type="number" value={state.config.h} onChange={e=>call('/config', {...state.config, h: parseInt(e.target.value)})} /></div>
        </div>
      )}

      {state.status === 'waiting' && (
        <div className="max-w-4xl w-full grid md:grid-cols-2 gap-6">
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
            <h2 className="text-xl font-bold mb-4 text-blue-400">1. Đăng Ký</h2>
            <div className="grid gap-4">
              <input className="bg-slate-700 p-2 rounded" placeholder="Tên..." value={reg.name} onChange={e=>setReg({...reg, name: e.target.value})}/>
              <div className="flex gap-2">
                <select className="bg-slate-700 p-2 flex-1 rounded text-xs" value={reg.weapon} onChange={e=>setReg({...reg, weapon: e.target.value})}>
                  <option value="dagger">🗡️ Dao (Nhanh, Yếu)</option>
                  <option value="sword">🤺 Kiếm (Cân bằng)</option>
                  <option value="spear">🔱 Giáo (Tầm dài)</option>
                  <option value="bow">🏹 Cung (Bắn xa)</option>
                  <option value="magic">🪄 Phép (Đam to, Xa)</option>
                  <option value="hammer">🔨 Búa (Rất Chậm, Đam Khủng)</option>
                </select>
                <select className="bg-slate-700 p-2 flex-1 rounded text-xs" value={reg.shield} onChange={e=>setReg({...reg, shield: e.target.value})}>
                  <option value="buckler">🥏 Khiên Nhỏ (Rất nhẹ)</option>
                  <option value="magic_ward">🔮 Khiên Phép (Nhẹ)</option>
                  <option value="wood_shield">🪵 Khiên Gỗ (Vừa)</option>
                  <option value="steel_shield">🛡️ Khiên Thép (Nặng)</option>
                  <option value="tower_shield">🧱 Khiên Tháp (Rất Nặng)</option>
                </select>
              </div>
              <p className="text-xs text-orange-400 italic text-center">Đồ càng to càng chậm. Chọn kỹ nhé!</p>
              <button className="bg-blue-600 font-bold p-2 rounded" onClick={()=>call('/register', reg).then(()=>setReg({...reg, name:''}))}>Vào Sảnh</button>
            </div>
          </div>
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
            <div className="flex justify-between items-center mb-4">
               <h2 className="text-xl font-bold">Danh sách ({lobby.length})</h2>
               {isHost && <button className="text-xs bg-red-900 px-2 py-1 rounded" onClick={()=>call('/reset')}>Xóa Tất Cả</button>}
            </div>
            <div className="space-y-2 h-48 overflow-auto">
              {lobby.map(p => (
                <div key={p.name} className="p-2 bg-slate-700 rounded flex justify-between items-center">
                   <span>👤 {p.name} <span className="text-xs text-slate-400">({p.weapon}/{p.shield})</span></span>
                   {isHost && <button className="text-red-500 font-bold px-2" onClick={()=>call(`/player/${p.name}`, null, 'DELETE')}>×</button>}
                </div>
              ))}
            </div>
            {isHost && <button className="w-full mt-4 bg-yellow-600 text-black font-bold p-3 rounded" onClick={()=>call('/phase-strategy')}>Chốt Danh Sách →</button>}
            {!isHost && <p className="text-xs text-center mt-4 text-slate-500">Chờ chủ phòng chốt danh sách...</p>}
          </div>
        </div>
      )}

      {state.status === 'strategy' && (
        <div className="max-w-2xl w-full">
          <div className="bg-slate-800 p-4 rounded-xl border border-red-500 mb-6 text-center shadow-[0_0_15px_rgba(239,68,68,0.3)]">
            <h2 className="text-sm font-bold uppercase text-slate-300">Tự động khai chiến sau</h2>
            <div className="text-5xl font-black text-red-500 my-2">{state.timer}s</div>
            <p className="text-xs italic">{state.ready_count}/{lobby.length} người đã cài AI.</p>
          </div>
          <div className="bg-slate-800 p-6 rounded-xl border border-purple-500">
            <h2 className="text-xl font-bold mb-4 text-purple-400">2. Lập Chiến Thuật Bí Mật</h2>
            <div className="space-y-4">
              <input className="w-full bg-slate-700 p-2 rounded" placeholder="Nhập đúng tên bạn..." value={strat.name} onChange={e=>setStrat({...strat, name: e.target.value})}/>
              <select className="w-full bg-slate-700 p-2 rounded" value={strat.target_rule} onChange={e=>setStrat({...strat, target_rule: e.target.value})}>
                <option value="closest">Gần nhất</option>
                <option value="lowest_hp">Thấp máu nhất (Ăn hôi)</option>
                <option value="highest_hp">Nhiều máu nhất (Diệt Tank)</option>
                <option value="furthest">Xa nhất (Sát thủ)</option>
                <option value="counter">Khắc hệ</option>
              </select>
              <select className="w-full bg-slate-700 p-2 rounded" value={strat.camp_until} onChange={e=>setStrat({...strat, camp_until: parseInt(e.target.value)})}>
                <option value="99">Đánh luôn</option><option value="5">Núp tới Top 5</option>
                <option value="3">Núp tới Top 3</option><option value="2">Núp tới Chung kết (Top 2)</option>
              </select>
              <button className="w-full bg-purple-600 font-bold p-3 rounded" onClick={()=>call('/update-strategy', strat).then(()=>alert("Đã lưu!"))}>Lưu Bí Mật</button>
            </div>
          </div>
        </div>
      )}

      {(state.status === 'playing' || state.status === 'finished') && (
        <div className="flex flex-col md:flex-row gap-6 w-full max-w-7xl justify-center items-start">
          <div className="relative bg-black rounded-lg border-4 border-slate-700 flex-shrink-0">
            <canvas ref={canvasRef} width={state.config.w} height={state.config.h} />
            {state.status === 'finished' && (
              <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center p-6 text-center m-2 rounded">
                <h2 className="text-5xl font-black text-yellow-500 mb-2 uppercase">Vô Địch</h2>
                <div className="text-4xl font-bold mb-6 text-white">{state.winner_info?.name}</div>
                <div className="bg-slate-800 p-4 rounded text-left border border-yellow-500 text-sm">
                    <p>⚔️ Vũ khí: {state.winner_info?.weapon}</p>
                    <p>🛡️ Khiên: {state.winner_info?.shield}</p>
                    <hr className="my-2 border-slate-600" />
                    <p className="text-yellow-500">🎯 AI: {state.winner_info?.strategy.target_rule}</p>
                    <p className="text-yellow-500">🌿 Núp: {state.winner_info?.strategy.camp_until}</p>
                </div>
                {isHost && <button className="mt-8 bg-blue-600 px-8 py-3 rounded-full font-bold" onClick={()=>call('/reset')}>Giải Đấu Mới</button>}
              </div>
            )}
          </div>
          <div className="bg-slate-800 p-4 rounded-lg w-full max-w-sm flex flex-col border border-slate-700 text-xs" style={{height: state.config.h}}>
             <h3 className="font-bold text-red-500 mb-2 uppercase tracking-widest text-center">Trực Tiếp</h3>
             <div className="flex-grow overflow-auto space-y-2 flex flex-col-reverse font-mono">
                {[...state.logs].reverse().map((l, i) => <div key={i} className="p-2 bg-slate-900 rounded border-l-2 border-slate-600">{l}</div>)}
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;