import React, { useState, useEffect, useRef } from 'react';

const API_URL = "http://localhost:8000/api";
const WS_URL = "ws://localhost:8000/ws";

// --- SFX AUDIO ENGINE ---
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }
  
  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  play(type, weapon = null) {
    if (this.muted || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    const t = this.ctx.currentTime;
    
    if (type === 'attack') {
      if (weapon === 'sword') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, t); osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
        gain.gain.setValueAtTime(0.5, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1); osc.start(t); osc.stop(t + 0.1);
      } else if (weapon === 'spear') {
        osc.type = 'triangle'; osc.frequency.setValueAtTime(500, t); osc.frequency.linearRampToValueAtTime(100, t + 0.05);
        gain.gain.setValueAtTime(0.4, t); gain.gain.linearRampToValueAtTime(0.01, t + 0.05); osc.start(t); osc.stop(t + 0.05);
      } else if (weapon === 'dagger') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(1000, t); osc.frequency.exponentialRampToValueAtTime(1500, t + 0.08);
        gain.gain.setValueAtTime(0.2, t); gain.gain.linearRampToValueAtTime(0.01, t + 0.08); osc.start(t); osc.stop(t + 0.08);
      } else if (weapon === 'bow') {
        osc.type = 'square'; osc.frequency.setValueAtTime(350, t); osc.frequency.exponentialRampToValueAtTime(100, t + 0.15);
        gain.gain.setValueAtTime(0.1, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15); osc.start(t); osc.stop(t + 0.15);
      } else if (weapon === 'hammer') {
        osc.type = 'square'; osc.frequency.setValueAtTime(100, t); osc.frequency.exponentialRampToValueAtTime(20, t + 0.4);
        gain.gain.setValueAtTime(0.9, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4); osc.start(t); osc.stop(t + 0.4);
      }
    } 
    else if (type === 'death') {
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(100, t); osc.frequency.linearRampToValueAtTime(10, t + 0.5);
      gain.gain.setValueAtTime(0.8, t); gain.gain.linearRampToValueAtTime(0.01, t + 0.5); osc.start(t); osc.stop(t + 0.5);
    }
    else if (type === 'win') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(400, t); osc.frequency.setValueAtTime(500, t+0.2); osc.frequency.setValueAtTime(600, t+0.4);
      gain.gain.setValueAtTime(0.5, t); gain.gain.linearRampToValueAtTime(0, t + 1.0); osc.start(t); osc.stop(t + 1.0);
    }
    else if (type === 'heal') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(600, t); osc.frequency.linearRampToValueAtTime(1200, t + 0.3);
      gain.gain.setValueAtTime(0.3, t); gain.gain.linearRampToValueAtTime(0.01, t + 0.3); osc.start(t); osc.stop(t + 0.3);
    }
    else if (type === 'dodge') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(800, t); osc.frequency.exponentialRampToValueAtTime(200, t + 0.2);
      gain.gain.setValueAtTime(0.3, t); gain.gain.linearRampToValueAtTime(0.01, t + 0.2); osc.start(t); osc.stop(t + 0.2);
    }
  }
}
// Đối tượng phát âm thanh dùng chung (Global)
const sfx = new SoundEngine();

const getVietnameseVoice = () => {
  if (!window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  let v = voices.find(voice => voice.name === "Google Tiếng Việt");
  if (v) return v;
  v = voices.find(voice => voice.lang.includes('vi') || voice.name.toLowerCase().includes('vietnamese'));
  return v;
};

class VoiceEngine {
  constructor() {
    this.synth = window.speechSynthesis;
    this.muted = false;
    this.lastSpeakTime = 0;
  }
  
  shout(type) {
    if (this.muted || !this.synth) return;
    const now = Date.now();
    if (now - this.lastSpeakTime < 600) return;

    let text = "";
    if(type === 'attack') {
        const arr =["Ya!", "Chết đi!", "Đỡ này!", "Ha!", "Xông lên!"];
        text = arr[Math.floor(Math.random()*arr.length)];
    } else if(type === 'hurt') {
        const arr =["Á!", "Ui da!", "Hự!", "Đau!", "Oái!"];
        text = arr[Math.floor(Math.random()*arr.length)];
    } else if (type === 'crit') {
        text = "Chí mạng!";
    } else if (type === 'dodge') {
        text = "Né được rồi!";
    }
    
    if(!text) return;

    const u = new SpeechSynthesisUtterance(text);
    const viVoice = getVietnameseVoice();
    if (viVoice) u.voice = viVoice;
    u.lang = 'vi-VN';
    u.pitch = 0.6 + Math.random() * 0.8; 
    u.rate = 1.6; 
    u.volume = 1.0;
    
    this.synth.speak(u);
    this.lastSpeakTime = now;
  }
}
const humanVoice = new VoiceEngine();

const speakLog = (text, langStr, muted) => {
  if (muted || !window.speechSynthesis) return;
  const msg = new SpeechSynthesisUtterance(text);
  const viVoice = getVietnameseVoice();
  if (langStr === 'vi' && viVoice) {
    msg.voice = viVoice;
  }
  msg.lang = langStr === 'vi' ? 'vi-VN' : 'en-US';
  msg.rate = 1.2;
  window.speechSynthesis.speak(msg);
};

export default function App() {
  const[gameState, setGameState] = useState(null);
  const[started, setStarted] = useState(false);
  const[muted, setMuted] = useState(false);
  
  const[globalHostPwd, setGlobalHostPwd] = useState('');
  const spokenLogs = useRef(new Set());

  useEffect(() => {
    if(window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.getVoices();
    }
  },[]);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setGameState(data);
      
      if(data.events && started) {
        data.events.forEach(ev => {
          if(ev.type === 'attack') {
            sfx.play('attack', ev.weapon);
            humanVoice.shout('attack');
            if(ev.is_crit) humanVoice.shout('crit');
          }
          if(ev.type === 'hurt') humanVoice.shout('hurt');
          if(ev.type === 'dodge') { sfx.play('dodge'); humanVoice.shout('dodge'); }
          if(ev.type === 'heal') sfx.play('heal');
          if(ev.type === 'death') sfx.play('death');
          if(ev.type === 'win') sfx.play('win');
        });
      }

      if(data.logs.length > 0 && started) {
        const topLog = data.logs[0];
        if(!spokenLogs.current.has(topLog)) {
          spokenLogs.current.add(topLog);
          if(topLog.includes("💀") || topLog.includes("🏆")) {
            speakLog(topLog.replace(/[^\p{L}\p{N}\s]/gu, ''), data.config.language, muted);
          }
        }
      }
    };
    return () => ws.close();
  },[started, muted]);

  const handleStartGameClick = () => {
    sfx.init(); 
    setStarted(true);
  };

  if (!started) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white flex-col">
        <h1 className="text-4xl font-bold mb-8 text-yellow-500 tracking-widest drop-shadow-[0_0_15px_rgba(234,179,8,0.8)]">AUTO-BATTLER: BATTLE ROYALE</h1>
        <button onClick={handleStartGameClick} className="bg-green-600 hover:bg-green-500 text-2xl font-bold py-4 px-10 rounded-full animate-bounce shadow-[0_0_20px_rgba(34,197,94,0.5)]">
          BẤM VÀO ĐÂY ĐỂ VÀO GAME (Cấp quyền Audio)
        </button>
        <p className="mt-8 text-gray-500 text-sm max-w-lg text-center">
          * Khuyên dùng trình duyệt Chrome/Edge để có Voice AI MC bình luận.
        </p>
      </div>
    );
  }

  if (!gameState) return <div className="flex h-screen items-center justify-center text-xl text-white">Đang tải cấu hình máy chủ...</div>;

  sfx.muted = muted;
  humanVoice.muted = muted;

  return (
    <div className={`w-full bg-gray-900 text-white flex flex-col ${gameState.phase === 'playing' ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      <header className="shrink-0 bg-gray-800 p-3 shadow-md flex justify-between items-center z-10 relative border-b border-gray-700">
        <h1 className="text-2xl font-bold text-yellow-400">{gameState.config.room_name}</h1>
        <button onClick={() => setMuted(!muted)} className={`p-2 rounded font-bold ${muted ? 'bg-red-600' : 'bg-green-600'}`}>
          {muted ? "🔇 TẮT ÂM" : "🔊 BẬT ÂM"}
        </button>
      </header>

      <main className={`flex-1 w-full flex ${gameState.phase === 'playing' ? 'min-h-0 overflow-hidden' : ''}`}>
        {gameState.phase === 'waiting' && <Phase1 gameState={gameState} hostPwd={globalHostPwd} setHostPwd={setGlobalHostPwd} />}
        {gameState.phase === 'strategy' && <Phase2 gameState={gameState} hostPwd={globalHostPwd} setHostPwd={setGlobalHostPwd} />}
        {gameState.phase === 'playing' && <Phase3 gameState={gameState} hostPwd={globalHostPwd} />}
        {gameState.phase === 'finished' && <PhaseFinished gameState={gameState} />}
      </main>
    </div>
  );
}

// --- PHASE 1: LOBBY & HOST ---
function Phase1({ gameState, hostPwd, setHostPwd }) {
  const[name, setName] = useState('');
  const[pwd, setPwd] = useState('');
  const[weapon, setWeapon] = useState('sword');
  const[shield, setShield] = useState('wood_shield');

  const[localConfig, setLocalConfig] = useState(gameState.config);
  
  const WEAPONS = gameState.config.weapons;
  const SHIELDS = gameState.config.shields;

  // Xử lý Thay Đổi Vũ Khí -> Phát Âm Thanh Demo
  const handleWeaponChange = (e) => {
    const selectedWep = e.target.value;
    setWeapon(selectedWep);
    // Vừa chọn xong là gọi API Audio phát tiếng chém luôn
    sfx.play('attack', selectedWep);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!name || !pwd) return alert("Nhập tên và mật khẩu!");
    const res = await fetch(`${API_URL}/register`, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ name, pwd, weapon, shield })
    });
    const d = await res.json();
    if(d.error) alert(d.error); else alert("Đăng ký thành công!");
  };

  const saveConfig = async () => {
    await fetch(`${API_URL}/config`, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify(localConfig)
    });
    alert("Đã lưu cấu hình lên Server!");
  };

  const handleClearPlayers = async () => {
    if(window.confirm("Xóa toàn bộ người chơi hiện tại?")) {
      await fetch(`${API_URL}/clear_players`, { method: 'POST' });
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-y-auto">
      
      {/* 1. ĐĂNG KÝ */}
      <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 h-fit">
        <h2 className="text-xl font-bold mb-4 text-blue-400">1. Đăng ký tham gia</h2>
        <form onSubmit={handleRegister} className="flex flex-col gap-3">
          <input className="p-2 bg-gray-700 rounded focus:border-blue-500 outline-none" placeholder="Tên hiển thị" value={name} onChange={e=>setName(e.target.value)} />
          <input className="p-2 bg-gray-700 rounded focus:border-blue-500 outline-none" placeholder="Mật khẩu (để đổi chiến thuật)" type="password" value={pwd} onChange={e=>setPwd(e.target.value)} />
          
          <label className="text-sm text-gray-400 mt-2 flex justify-between items-center">
            <span>Chọn Vũ Khí</span>
            <span className="text-xs text-green-400 font-bold animate-pulse">🔊 Bấm để nghe thử</span>
          </label>
          <select className="p-2 bg-gray-700 rounded cursor-pointer border border-transparent focus:border-green-500" value={weapon} onChange={handleWeaponChange}>
            {Object.entries(WEAPONS).map(([k,v]) => <option key={k} value={k}>{v.e} {v.n}</option>)}
          </select>

          <label className="text-sm text-gray-400 mt-2">Chọn Khiên</label>
          <select className="p-2 bg-gray-700 rounded cursor-pointer border border-transparent focus:border-blue-500" value={shield} onChange={e=>setShield(e.target.value)}>
            {Object.entries(SHIELDS).map(([k,v]) => <option key={k} value={k}>{v.e} {v.n}</option>)}
          </select>

          <button className="bg-blue-600 hover:bg-blue-500 py-3 mt-4 rounded font-bold shadow-lg">GHI DANH LÊN BẢNG</button>
        </form>

        <div className="mt-8 border-t border-gray-700 pt-4">
          <h3 className="font-bold text-green-400 mb-2">Người đã vào phòng ({Object.keys(gameState.players).length}):</h3>
          <div className="flex flex-wrap gap-2">
            {Object.values(gameState.players).map(p => (
               <span key={p.name} className="px-2 py-1 bg-gray-700 rounded text-sm shadow-sm">{p.name} {WEAPONS[p.weapon].e}{SHIELDS[p.shield].e}</span>
            ))}
          </div>
        </div>
      </div>

      {/* 2. BÁCH KHOA TOÀN THƯ */}
      <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 h-[650px] overflow-y-auto custom-scrollbar">
        <h2 className="text-2xl font-bold mb-4 text-yellow-400 border-b border-gray-600 pb-2">📖 Bách Khoa Cờ Nhân Phẩm</h2>
        <div className="text-sm space-y-6">
          
          <div className="bg-gray-700 p-3 rounded shadow-inner border-l-4 border-green-500">
            <h3 className="font-bold text-green-400 text-base mb-1">🏃 Tốc Độ Di Chuyển</h3>
            <p>Phụ thuộc vào Độ Nặng trang bị. <br/><b>Tốc độ = Base - (Nặng VK + Nặng Khiên).</b> Càng nhẹ chạy càng nhanh.</p>
          </div>

          <div className="bg-gray-700 p-3 rounded shadow-inner border-l-4 border-yellow-500">
            <h3 className="font-bold text-yellow-400 text-base mb-1">🎲 Nhân Phẩm (RNG) & Môi Trường</h3>
            <ul className="list-disc pl-4 mt-1 space-y-1">
              <li><b>Chí Mạng (Crit):</b> Sát thương gây ra ngẫu nhiên x1.5 hoặc x2 tùy loại vũ khí. Dao Găm có tỉ lệ nổ Crit cực cao (30%).</li>
              <li><b>Né Đòn (Dodge):</b> Ngẫu nhiên né 100% sát thương. Cầm Khiên Nhỏ có tới 25% cơ hội Né!</li>
              <li><b>Bụi Cỏ (Stealth):</b> Bản đồ có các lùm cây xanh. Chui vào tàng hình, AI địch sẽ bị "mù", không thể chém bạn.</li>
              <li><b>Hộp Tiếp Tế (Airdrop):</b> Thỉnh thoảng rớt hộp thuốc. Chạy lại nhặt hồi ngay 150 Máu!</li>
            </ul>
          </div>

          <div>
            <h3 className="font-bold text-red-400 text-base border-b border-gray-600 pb-1 mb-2">⚔️ Khắc Hệ (Sát thương x2)</h3>
            <ul className="list-disc pl-4 space-y-1 text-gray-300">
              <li><b className="text-white">Kiếm / Dao / Cung</b> chém rách <b className="text-yellow-500">Khiên Gỗ</b>.</li>
              <li><b className="text-white">Giáo / Búa</b> đập nát <b className="text-gray-400">Khiên Thép</b>.</li>
              <li><b className="text-white">Kiếm / Giáo / Cung</b> xuyên thủng <b className="text-blue-300">Khiên Nhỏ</b>.</li>
            </ul>
          </div>

          <div>
            <h3 className="font-bold text-yellow-500 text-base border-b border-gray-600 pb-1 mb-2">📊 Bảng Chỉ Số Vũ Khí & Khiên</h3>
            <ul className="mt-2 space-y-2 text-gray-300">
              {Object.values(WEAPONS).map(v => (
                <li key={v.n} className="bg-gray-700 p-2 rounded">
                  {v.e} <b className="text-white">{v.n}</b>: Đam <b>{v.dmg}</b> | Nặng <b>{v.weight}</b><br/>
                  <span className="text-xs text-yellow-400">Chí mạng: {v.crit*100}% (x{v.crit_mult})</span>
                </li>
              ))}
            </ul>
            <ul className="mt-4 space-y-2 text-gray-300">
              {Object.values(SHIELDS).map(v => (
                <li key={v.n} className="bg-gray-700 p-2 rounded">
                  {v.e} <b className="text-white">{v.n}</b>: Đỡ <b>{v.b}</b> Đam | Nặng <b>{v.weight}</b><br/>
                  <span className="text-xs text-green-300">Tỉ lệ Né đòn: {v.dodge*100}%</span>
                </li>
              ))}
            </ul>
          </div>

        </div>
      </div>

      {/* 3. HOST PANEL */}
      <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 h-fit">
        <h2 className="text-xl font-bold mb-4 text-purple-400">👑 Bảng điều khiển Host</h2>
        <input className="p-2 w-full bg-gray-700 rounded mb-4 focus:border-purple-500 outline-none" placeholder="Nhập pass Host ..." type="password" value={hostPwd} onChange={e=>setHostPwd(e.target.value)} />
        
        {hostPwd === 'dev123' && (
          <div className="flex flex-col gap-3 animate-fade-in">
            <label className="text-xs text-gray-400 -mb-2">Tên Phòng</label>
            <input className="p-2 bg-gray-700 rounded" value={localConfig.room_name} onChange={e=>setLocalConfig({...localConfig, room_name: e.target.value})} placeholder="Tên phòng" />
            
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs text-gray-400 block mb-1">Chiều Ngang Map (Width)</label>
                <input type="number" className="p-2 bg-gray-700 rounded w-full" value={localConfig.map_width} onChange={e=>setLocalConfig({...localConfig, map_width: parseInt(e.target.value)})} title="Chiều rộng Pixel"/>
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-400 block mb-1">Chiều Dọc Map (Height)</label>
                <input type="number" className="p-2 bg-gray-700 rounded w-full" value={localConfig.map_height} onChange={e=>setLocalConfig({...localConfig, map_height: parseInt(e.target.value)})} title="Chiều cao Pixel"/>
              </div>
            </div>

            <div className="flex gap-4 mt-2">
              <div className="flex-1">
                <label className="text-xs text-gray-400 block mb-1">Màu Nền Trong Bo</label>
                <input type="color" className="p-1 bg-gray-700 rounded w-full h-10 cursor-pointer" value={localConfig.bg_color} onChange={e=>setLocalConfig({...localConfig, bg_color: e.target.value})} title="Màu nền" />
              </div>
              <div className="flex-1">
                 <label className="text-xs text-gray-400 block mb-1">Giọng Đọc MC</label>
                <select className="p-2 bg-gray-700 rounded w-full h-10" value={localConfig.language} onChange={e=>setLocalConfig({...localConfig, language: e.target.value})}>
                  <option value="vi">Tiếng Việt</option><option value="en">English</option>
                </select>
              </div>
            </div>
            
            <button onClick={saveConfig} className="bg-purple-600 hover:bg-purple-500 py-2 rounded font-bold mt-2">💾 LƯU CẤU HÌNH UI</button>
            <p className="text-xs text-center text-gray-400">* Để thay đổi Máu (HP), Tầm Đánh, Đam... hãy edit file `backend_data/game_config.json`.</p>
            <hr className="border-gray-600 my-2" />
            
            <div className="flex gap-2">
              <button onClick={()=>fetch(`${API_URL}/bots`,{method:'POST'})} className="flex-1 bg-gray-600 hover:bg-gray-500 py-2 rounded text-sm font-bold">🤖 10 Bots</button>
              <button onClick={handleClearPlayers} className="flex-1 bg-red-900 hover:bg-red-800 py-2 rounded text-sm font-bold shadow-md border border-red-700">🗑️ Xóa Tất Cả</button>
            </div>

            <button onClick={()=>fetch(`${API_URL}/phase/strategy`,{method:'POST'})} className="bg-red-600 hover:bg-red-500 py-3 rounded font-bold text-lg mt-2 animate-pulse shadow-lg shadow-red-500/50">🔥 BẮT ĐẦU -> LÊN CHIẾN THUẬT</button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- PHASE 2: STRATEGY ---
function Phase2({ gameState, hostPwd, setHostPwd }) {
  const [name, setName] = useState('');
  const[pwd, setPwd] = useState('');
  const[targetRule, setTargetRule] = useState('nearest');
  const[campRule, setCampRule] = useState('attack');

  const saveTactics = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API_URL}/strategy`, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ name, pwd, target_rule: targetRule, camp_rule: campRule })
    });
    const d = await res.json();
    if(d.error) alert(d.error); else alert("Cài AI thành công!");
  };

  const forceStart = async () => {
    if (hostPwd !== 'dev123') return alert("Sai mật khẩu Host!");
    await fetch(`${API_URL}/phase/playing`, { method: "POST" });
  };

  return (
    <div className="flex flex-col w-full items-center p-8 overflow-y-auto">
      <h2 className="text-4xl font-bold mb-2 text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]">CHUẨN BỊ CHIẾN ĐẤU</h2>
      <div className="text-6xl font-mono text-yellow-400 mb-6 drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]">
        {gameState.timer}s
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
        <div className="bg-gray-800 p-8 rounded-xl border border-gray-700 shadow-2xl flex flex-col justify-between">
          <div>
            <h3 className="text-xl font-bold mb-4 text-center text-blue-400">Tùy Chỉnh AI Của Bạn (Bí mật)</h3>
            <form onSubmit={saveTactics} className="flex flex-col gap-4">
              <input className="p-3 bg-gray-700 rounded outline-none focus:border-blue-500 border border-transparent" placeholder="Xác nhận Tên của bạn" value={name} onChange={e=>setName(e.target.value)} />
              <input className="p-3 bg-gray-700 rounded outline-none focus:border-blue-500 border border-transparent" placeholder="Nhập Mật khẩu" type="password" value={pwd} onChange={e=>setPwd(e.target.value)} />
              
              <div>
                <label className="text-sm text-gray-400 font-bold">Mục tiêu ưu tiên</label>
                <select className="p-3 bg-gray-700 rounded w-full mt-1" value={targetRule} onChange={e=>setTargetRule(e.target.value)}>
                  <option value="nearest">Đánh Gần nhất (Khuyên dùng cho Cận chiến)</option>
                  <option value="lowest_hp">Săn Kẻ Yếu HP nhất (Móc lốp cướp mạng)</option>
                  <option value="tankiest">Đánh Trâu HP nhất (Diệt boss)</option>
                  <option value="counter">Săn Kẻ bị mình khắc hệ (Khuyên dùng cho Sát Thủ)</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-400 font-bold">Chiến thuật Sinh tồn</label>
                <select className="p-3 bg-gray-700 rounded w-full mt-1" value={campRule} onChange={e=>setCampRule(e.target.value)}>
                  <option value="attack">Khô máu ngay từ đầu (Tử chiến)</option>
                  <option value="top5">Núp lùm lảng tránh đến khi còn Top 5</option>
                  <option value="top3">Núp lùm lảng tránh đến khi còn Top 3</option>
                  <option value="top2">Núp lùm lảng tránh đến khi còn Top 2</option>
                </select>
              </div>
              <button className="bg-green-600 hover:bg-green-500 py-4 mt-4 rounded font-bold shadow-[0_0_15px_rgba(22,163,74,0.4)] text-lg uppercase tracking-wider">
                LƯU CHỈ THỊ AI
              </button>
            </form>
          </div>
        </div>

        <div className="bg-gray-800 p-8 rounded-xl border border-purple-500 shadow-2xl flex flex-col justify-center">
          <h3 className="text-xl font-bold mb-4 text-center text-purple-400">👑 Quyền Host</h3>
          <p className="text-sm text-gray-300 text-center mb-6">Sử dụng khi bạn muốn ép tiến độ bỏ qua thời gian đếm ngược, hoặc test sức mạnh Bots.</p>
          <input className="p-3 bg-gray-700 rounded mb-4 text-center text-lg outline-none" placeholder="Nhập Pass Host (dev123)" type="password" value={hostPwd} onChange={e=>setHostPwd(e.target.value)} />
          {hostPwd === 'dev123' && (
            <button onClick={forceStart} className="bg-red-600 hover:bg-red-500 py-4 px-6 rounded font-bold text-white uppercase tracking-wider animate-pulse shadow-[0_0_20px_rgba(220,38,38,0.6)]">
              ⏩ Bỏ qua Chờ & Vào Game Luôn
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- PHASE 3: PLAYING (CANVAS MAP + CASTER PANEL) ---
function Phase3({ gameState, hostPwd }) {
  const canvasRef = useRef(null);
  const vfxRef = useRef([]); 

  const WEAPONS = gameState.config.weapons;
  const SHIELDS = gameState.config.shields;
  const cardW = gameState.config.character_settings.card_width;
  const cardH = gameState.config.character_settings.card_height;

  const handleForceEnd = async () => {
    let pwd = hostPwd;
    if (pwd !== 'dev123') {
      pwd = window.prompt("Nhập Pass Host (dev123) để Dừng Trận Sớm:");
    }
    if (pwd === "dev123") {
      await fetch(`${API_URL}/force_end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pwd })
      });
    } else if (pwd !== null) {
      alert("Sai mật khẩu Host!");
    }
  };

  useEffect(() => {
    if (gameState.events) {
      gameState.events.forEach(ev => {
        if (ev.type === 'attack') {
          vfxRef.current.push({ type: 'slash', x: ev.x, y: ev.y, tx: ev.tx, ty: ev.ty, weapon: ev.weapon, life: 8 });
          if(ev.is_crit) {
            vfxRef.current.push({ type: 'text', x: ev.tx, y: ev.ty - 40, text: `💥 CRIT -${ev.dmg}`, color: '#ef4444', life: 30 });
          } else {
             vfxRef.current.push({ type: 'text', x: ev.tx, y: ev.ty - 40, text: `-${ev.dmg}`, color: '#fca5a5', life: 20 });
          }
        }
        if (ev.type === 'dodge') {
           vfxRef.current.push({ type: 'text', x: ev.x, y: ev.y - 40, text: `💨 MISS`, color: '#6ee7b7', life: 30 });
        }
        if (ev.type === 'heal') {
           vfxRef.current.push({ type: 'text', x: ev.x, y: ev.y - 50, text: ev.text, color: '#4ade80', life: 40 });
        }
        if (ev.type === 'hurt') {
          for (let i = 0; i < 8; i++) {
            vfxRef.current.push({
              type: 'blood', x: ev.x, y: ev.y, 
              vx: (Math.random() - 0.5) * 15, vy: (Math.random() - 0.5) * 15, life: 10 + Math.random() * 5
            });
          }
        }
      });
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cw = gameState.config.map_width;
    const ch = gameState.config.map_height;
    const z = gameState.zone;
    
    // LAYER 1: BÊN NGOÀI BO
    ctx.fillStyle = '#111827'; 
    ctx.fillRect(0, 0, cw, ch);

    // LAYER 2: BÊN TRONG BO
    ctx.beginPath();
    ctx.arc(z.x, z.y, Math.max(0, z.r), 0, Math.PI * 2);
    ctx.fillStyle = gameState.config.bg_color;
    ctx.shadowBlur = 50;
    ctx.shadowColor = '#EF4444';
    ctx.fill();
    ctx.shadowBlur = 0;

    // LAYER 3: KẺ LƯỚI GRID
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for(let i=0; i<cw; i+=100) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,ch); ctx.stroke(); }
    for(let i=0; i<ch; i+=100) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(cw,i); ctx.stroke(); }

    // LAYER 4: VIỀN VÒNG BO ĐỎ
    ctx.beginPath();
    ctx.arc(z.x, z.y, Math.max(0, z.r), 0, Math.PI * 2);
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 6;
    ctx.stroke();

    // LAYER 5: BỤI CỎ (STEALTH BUSHES) - ĐÃ FIX MÀU XANH NỔI BẬT DÙ NỀN LÀ VÀNG
    if(gameState.bushes) {
      gameState.bushes.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        // Màu xanh lá đậm opacity 75% để nổi trên bất kỳ nền nào
        ctx.fillStyle = 'rgba(34, 197, 94, 0.75)'; 
        ctx.fill();
        
        // Viền xanh lá viền đứt
        ctx.strokeStyle = 'rgba(20, 83, 45, 0.9)'; // Dark green
        ctx.lineWidth = 4;
        ctx.setLineDash([15, 20]);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }

    // LAYER 6: HỘP CỨU THƯƠNG (AIRDROPS)
    if(gameState.airdrops) {
      gameState.airdrops.forEach(drop => {
        ctx.fillStyle = '#854d0e'; 
        ctx.fillRect(drop.x - 15, drop.y - 15, 30, 30);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(drop.x - 4, drop.y - 10, 8, 20);
        ctx.fillRect(drop.x - 10, drop.y - 4, 20, 8);
        ctx.strokeStyle = '#facc15';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#facc15';
        ctx.strokeRect(drop.x - 15, drop.y - 15, 30, 30);
        ctx.shadowBlur = 0;
      });
    }

    // LAYER 7: VÒNG TRÒN TẦM ĐÁNH
    Object.values(gameState.players).forEach(p => {
      if (!p.alive || p.in_bush) return;
      const w_data = WEAPONS[p.weapon];
      
      let fillColor = 'rgba(255, 255, 255, 0.05)';
      let strokeColor = 'rgba(255, 255, 255, 0.6)';
      let glowColor = '#ffffff';

      if (p.weapon === 'sword') { fillColor = 'rgba(239, 68, 68, 0.06)'; strokeColor = 'rgba(239, 68, 68, 0.6)'; glowColor = '#ef4444'; }
      else if (p.weapon === 'bow') { fillColor = 'rgba(234, 179, 8, 0.06)'; strokeColor = 'rgba(234, 179, 8, 0.6)'; glowColor = '#eab308'; }
      else if (p.weapon === 'spear') { fillColor = 'rgba(59, 130, 246, 0.06)'; strokeColor = 'rgba(59, 130, 246, 0.6)'; glowColor = '#3b82f6'; }
      else if (p.weapon === 'hammer') { fillColor = 'rgba(249, 115, 22, 0.06)'; strokeColor = 'rgba(249, 115, 22, 0.6)'; glowColor = '#f97316'; }
      else if (p.weapon === 'dagger') { fillColor = 'rgba(168, 85, 247, 0.06)'; strokeColor = 'rgba(168, 85, 247, 0.6)'; glowColor = '#a855f7'; }

      ctx.beginPath();
      ctx.arc(p.x, p.y, w_data.max_rng, 0, Math.PI*2);
      ctx.fillStyle = fillColor;
      ctx.fill(); 

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 10;
      ctx.shadowColor = glowColor;
      ctx.stroke();
      ctx.shadowBlur = 0;
    });

    // LAYER 8: ĐƯỜNG ĐẠN BAY XA
    gameState.projectiles.forEach(p => {
      if(p.type !== 'melee') { 
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI*2);
        ctx.fillStyle = p.type === 'dagger' ? '#9CA3AF' : p.type === 'bow' ? '#FDE047' : '#60A5FA';
        ctx.fill();
        ctx.shadowBlur = 15;
        ctx.shadowColor = ctx.fillStyle;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    });

    // LAYER 9: THẺ BÀI NHÂN VẬT
    Object.values(gameState.players).forEach(p => {
      if (!p.alive) {
        ctx.fillStyle = '#4B5563'; 
        ctx.fillRect(p.x - 25, p.y - 25, 50, 50);
        ctx.fillStyle = 'red'; ctx.font = '30px Arial'; ctx.textAlign = 'center';
        ctx.fillText('❌', p.x, p.y + 10);
        return;
      }

      ctx.save(); 
      if(p.in_bush) {
        ctx.globalAlpha = 0.4; 
      }

      const isBerserk = p.hp < (p.max_hp * 0.3);
      const cx = p.x - cardW / 2;
      const cy = p.y - cardH / 2;

      ctx.fillStyle = '#1F2937';
      ctx.fillRect(cx, cy, cardW, cardH);
      ctx.strokeStyle = isBerserk ? '#EF4444' : '#FBBF24';
      ctx.lineWidth = isBerserk ? 4 : 2;
      ctx.strokeRect(cx, cy, cardW, cardH);

      ctx.fillStyle = 'white';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      const shortName = p.name.length > 8 ? p.name.substring(0, 8) + '..' : p.name;
      ctx.fillText(shortName, p.x, cy + 22);

      ctx.font = '32px sans-serif';
      ctx.fillText(WEAPONS[p.weapon].e, p.x - 20, cy + 60);
      ctx.fillText(SHIELDS[p.shield].e, p.x + 20, cy + 60);

      const hpBoxX = cx + 8;
      const hpBoxY = cy + 80;
      const hpBoxW = cardW - 16;
      const hpBoxH = 16; 

      ctx.fillStyle = '#111827';
      ctx.fillRect(hpBoxX, hpBoxY, hpBoxW, hpBoxH);

      ctx.fillStyle = isBerserk ? '#EF4444' : '#22C55E';
      const hpPct = Math.max(0, p.hp / p.max_hp);
      ctx.fillRect(hpBoxX, hpBoxY, hpBoxW * hpPct, hpBoxH);

      ctx.fillStyle = 'white';
      ctx.font = 'bold 12px sans-serif'; 
      ctx.fillText(`${Math.floor(p.hp)} HP`, p.x, hpBoxY + 12);
      
      ctx.restore(); 
    });

    // LAYER 10: VẼ VFX (MÁU, CHÉM, CHỮ BAY) TRÊN CÙNG
    let activeVfx =[];
    vfxRef.current.forEach(v => {
      if (v.type === 'slash') {
        ctx.beginPath();
        ctx.moveTo(v.x, v.y);
        ctx.lineTo(v.tx, v.ty);
        
        let slashColor = '255, 255, 255';
        let glowColor = '#ffffff';
        if(v.weapon === 'sword') { slashColor = '239, 68, 68'; glowColor = '#ef4444'; }
        if(v.weapon === 'hammer') { slashColor = '249, 115, 22'; glowColor = '#f97316'; }
        if(v.weapon === 'spear') { slashColor = '59, 130, 246'; glowColor = '#3b82f6'; }

        ctx.strokeStyle = `rgba(${slashColor}, ${v.life / 6})`;
        ctx.lineWidth = v.life * 3; 
        ctx.shadowBlur = 15;
        ctx.shadowColor = glowColor;
        ctx.stroke();
        ctx.shadowBlur = 0;
      } 
      else if (v.type === 'blood') {
        ctx.beginPath();
        ctx.arc(v.x, v.y, v.life / 1.5, 0, Math.PI*2); 
        ctx.fillStyle = `rgba(220, 38, 38, ${v.life / 10})`; 
        ctx.fill();
        v.x += v.vx;
        v.y += v.vy;
      }
      else if (v.type === 'text') {
        ctx.fillStyle = v.color;
        ctx.font = 'bold 20px "Courier New"';
        ctx.textAlign = 'center';
        
        ctx.globalAlpha = Math.min(1, v.life / 20); 
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#000000';
        ctx.fillText(v.text, v.x, v.y);
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0;
        
        v.y -= 1.5; 
      }
      
      v.life -= 1;
      if (v.life > 0) activeVfx.push(v);
    });
    vfxRef.current = activeVfx; 

  },[gameState]);

  return (
    <div className="flex w-full h-full overflow-hidden min-h-0">
      <div className="flex-1 bg-[#0b0f19] relative flex items-center justify-center p-2 min-h-0 border-r border-gray-700">
        <canvas 
          ref={canvasRef} 
          width={gameState.config.map_width} 
          height={gameState.config.map_height} 
          className="w-full h-full object-contain rounded shadow-[0_0_25px_rgba(0,0,0,0.8)]"
        />
        <div className="absolute top-4 left-4 bg-gray-900/90 p-3 rounded border border-gray-600 font-mono text-lg text-white font-bold shadow-lg shadow-black flex flex-col gap-1">
          <div>Trạng thái: <span className="text-green-400">{Object.values(gameState.players).filter(p=>p.alive).length} Sống</span></div>
          <div>Vòng bo: <span className="text-red-400">{Math.floor(gameState.zone.r)}px</span></div>
        </div>
      </div>

      <div className="w-96 bg-gray-800 flex flex-col shrink-0 h-full min-h-0">
        <div className="p-3 bg-gray-900 font-bold border-b border-gray-700 text-purple-400 flex items-center justify-between gap-2">
          <span>🎙️ Caster Panel (Live)</span>
          <button 
            onClick={handleForceEnd} 
            className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-xs font-bold uppercase tracking-wider animate-pulse shadow-md"
            title="Dừng trận đấu ngay lập tức"
          >
            🛑 Kết Thúc Sớm
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 flex flex-col-reverse custom-scrollbar">
          {gameState.logs.map((log, i) => (
            <div key={i} className={`p-2 rounded text-sm font-mono border-l-2 ${log.includes('💀') || log.includes('🛑') ? 'border-red-500 bg-red-900/20 text-red-200' : log.includes('💥') ? 'border-yellow-500 bg-yellow-900/20 text-yellow-200' : log.includes('🎁') || log.includes('💉') ? 'border-green-500 bg-green-900/20 text-green-200' : 'border-blue-500 bg-gray-700'}`}>
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- PHASE FINISHED ---
function PhaseFinished({ gameState }) {
  const winner = Object.values(gameState.players).find(p => p.alive);
  const WEAPONS = gameState.config.weapons;
  const SHIELDS = gameState.config.shields;
  
  return (
    <div className="flex w-full items-center justify-center flex-col min-h-0 overflow-y-auto p-8">
      <div className="bg-gray-800 p-12 rounded-2xl border-4 border-yellow-500 text-center shadow-[0_0_50px_rgba(234,179,8,0.5)]">
        <div className="text-8xl mb-6">🏆</div>
        <h2 className="text-5xl font-bold text-yellow-400 mb-4">{winner ? winner.name : "HÒA NHAU"}</h2>
        <p className="text-xl text-gray-300">Đã sống sót cuối cùng trong Battle Royale!</p>
        
        {winner && (
          <div className="mt-8 bg-gray-900 p-6 rounded-xl text-left inline-block border border-gray-700 shadow-inner">
            <h3 className="text-green-400 font-bold text-xl border-b border-gray-700 pb-2 mb-4">Thông số nhà vô địch:</h3>
            <p className="text-lg mb-2">Trang bị: {WEAPONS[winner.weapon].e} {WEAPONS[winner.weapon].n} + {SHIELDS[winner.shield].e} {SHIELDS[winner.shield].n}</p>
            <p className="text-lg mb-2">Máu còn lại: <strong className="text-green-400">{Math.floor(winner.hp)} / {winner.max_hp}</strong></p>
            <p className="text-lg mb-2">AI Mục tiêu: <strong className="text-yellow-400">{winner.target_rule}</strong></p>
            <p className="text-lg">AI Sinh tồn: <strong className="text-yellow-400">{winner.camp_rule}</strong></p>
          </div>
        )}
      </div>
      <button onClick={()=>fetch(`${API_URL}/phase/waiting`,{method:'POST'})} className="mt-8 bg-gray-700 hover:bg-gray-600 px-8 py-3 rounded-full font-bold text-xl shadow-lg">Trở về sảnh</button>
    </div>
  );
}