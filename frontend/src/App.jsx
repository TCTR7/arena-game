import React, { useState, useEffect, useRef } from 'react';

const API_URL = "http://localhost:8000/api";
const WS_URL = "ws://localhost:8000/ws";

let availableVoices = [];
const loadVoices = () => {
  if (window.speechSynthesis) availableVoices = window.speechSynthesis.getVoices();
};
if (window.speechSynthesis) {
  loadVoices(); window.speechSynthesis.onvoiceschanged = loadVoices;
}

const getVietnameseVoice = () => {
  if (!availableVoices.length) loadVoices();
  let v = availableVoices.find(voice => (voice.name.includes("An") || voice.name.includes("HoaiMy")) && voice.lang.includes("vi"));
  if (v) return v;
  v = availableVoices.find(voice => voice.name === "Google Tiếng Việt");
  if (v) return v;
  v = availableVoices.find(voice => voice.lang.includes('vi') || voice.name.toLowerCase().includes('vietnamese'));
  return v;
};

class SoundEngine {
  constructor() { this.ctx = null; this.muted = false; }
  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  play(type, weapon = null) {
    if (this.muted || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
    osc.connect(gain); gain.connect(this.ctx.destination);
    const t = this.ctx.currentTime; 
    
    if (type === 'attack') {
      if (weapon === 'sword') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(800, t); osc.frequency.exponentialRampToValueAtTime(100, t + 0.15); gain.gain.setValueAtTime(0.8, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15); osc.start(t); osc.stop(t + 0.15); } 
      else if (weapon === 'spear') { osc.type = 'triangle'; osc.frequency.setValueAtTime(400, t); osc.frequency.exponentialRampToValueAtTime(50, t + 0.12); gain.gain.setValueAtTime(1.0, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12); osc.start(t); osc.stop(t + 0.12); } 
      else if (weapon === 'dagger') { osc.type = 'sine'; osc.frequency.setValueAtTime(1500, t); osc.frequency.exponentialRampToValueAtTime(800, t + 0.05); gain.gain.setValueAtTime(0.5, t); gain.gain.linearRampToValueAtTime(0.01, t + 0.05); osc.start(t); osc.stop(t + 0.05); } 
      else if (weapon === 'bow') { osc.type = 'sine'; osc.frequency.setValueAtTime(600, t); osc.frequency.exponentialRampToValueAtTime(150, t + 0.2); gain.gain.setValueAtTime(0.7, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2); const oscSnap = this.ctx.createOscillator(); oscSnap.type = 'square'; oscSnap.frequency.setValueAtTime(900, t); oscSnap.frequency.exponentialRampToValueAtTime(300, t + 0.05); oscSnap.connect(gain); oscSnap.start(t); oscSnap.stop(t + 0.05); osc.start(t); osc.stop(t + 0.2); } 
      else if (weapon === 'hammer') { osc.type = 'square'; osc.frequency.setValueAtTime(120, t); osc.frequency.exponentialRampToValueAtTime(20, t + 0.35); gain.gain.setValueAtTime(1.2, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35); osc.start(t); osc.stop(t + 0.35); }
    } 
    else if (type === 'death') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, t); osc.frequency.exponentialRampToValueAtTime(10, t + 0.6); gain.gain.setValueAtTime(0.9, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6); osc.start(t); osc.stop(t + 0.6); }
    else if (type === 'win') { osc.type = 'square'; [440, 554, 659].forEach((f, i) => osc.frequency.setValueAtTime(f, t+i*0.15)); gain.gain.setValueAtTime(0.4, t); gain.gain.linearRampToValueAtTime(0, t + 1.2); osc.start(t); osc.stop(t + 1.2); }
    else if (type === 'heal') { osc.type = 'sine'; osc.frequency.setValueAtTime(400, t); osc.frequency.linearRampToValueAtTime(1000, t + 0.3); gain.gain.setValueAtTime(0.4, t); gain.gain.linearRampToValueAtTime(0.01, t + 0.3); osc.start(t); osc.stop(t + 0.3); }
    else if (type === 'dodge') { osc.type = 'sine'; osc.frequency.setValueAtTime(900, t); osc.frequency.exponentialRampToValueAtTime(300, t + 0.15); gain.gain.setValueAtTime(0.3, t); gain.gain.linearRampToValueAtTime(0.01, t + 0.15); osc.start(t); osc.stop(t + 0.15); }
  }
}
const sfx = new SoundEngine();

class VoiceEngine {
  constructor() { this.synth = window.speechSynthesis; this.muted = false; }
  shout(type) {
    if (this.muted || !this.synth) return;
    let text = "";
    if (type === 'reveal') text = "Kính thưa quý vị! Cùng xem qua bảng chiến thuật... để biết ai là kẻ nguy hiểm nhất phòng hôm nay nào!";
    if(!text) return;
    const u = new SpeechSynthesisUtterance(text);
    const viVoice = getVietnameseVoice(); if (viVoice) u.voice = viVoice;
    u.lang = 'vi-VN'; 
    u.pitch = 1.1; 
    u.rate = 1.3; 
    this.synth.speak(u);
  }
}
const humanVoice = new VoiceEngine();

const speakLog = (text, langStr, muted) => {
  if (muted || !window.speechSynthesis) return;
  const cleanText = text.replace(/🎙️|🏆|💀|🔥|⚡|☠️|⚠️|🎤|🎁|💉/g, '').replace(/\[.*?s\]/g, '').trim();
  if(!cleanText) return;
  
  const msg = new SpeechSynthesisUtterance(cleanText);
  if (langStr === 'vi') {
    const viVoice = getVietnameseVoice(); if (viVoice) msg.voice = viVoice;
    msg.lang = 'vi-VN';
  } else {
    const enVoice = availableVoices.find(voice => voice.lang.startsWith('en'));
    if (enVoice) msg.voice = enVoice;
    msg.lang = 'en-US';
  }
  
  msg.rate = 1.55; 
  msg.pitch = 1.0 + (Math.random() * 0.3 - 0.15); 
  
  window.speechSynthesis.speak(msg);
};

const getDynamicColors = (weapon, hexBg) => {
  let c = hexBg.substring(1).split('');
  if(c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
  c = '0x' + c.join('');
  let rBg = (c >> 16) & 255, gBg = (c >> 8) & 255, bBg = c & 255;
  let isLightBg = (rBg * 0.299 + gBg * 0.587 + bBg * 0.114) > 128; 

  let rW, gW, bW;
  if (weapon === 'sword') { rW = 239; gW = 68; bW = 68; } 
  else if (weapon === 'bow') { rW = 234; gW = 179; bW = 8; } 
  else if (weapon === 'spear') { rW = 59; gW = 130; bW = 246; } 
  else if (weapon === 'hammer') { rW = 249; gW = 115; bW = 22; } 
  else if (weapon === 'dagger') { rW = 168; gW = 85; bW = 247; } 
  else { rW = 255; gW = 255; bW = 255; }

  let colorDiff = Math.abs(rW - rBg) + Math.abs(gW - gBg) + Math.abs(bW - bBg);
  if (colorDiff < 150) { rW = 255 - rBg; gW = 255 - gBg; bW = 255 - bBg; }

  if (isLightBg) {
    rW = Math.max(0, Math.floor(rW * 0.5)); gW = Math.max(0, Math.floor(gW * 0.5)); bW = Math.max(0, Math.floor(bW * 0.5));
    return { fill: `rgba(${rW}, ${gW}, ${bW}, 0.15)`, stroke: `rgba(${rW}, ${gW}, ${bW}, 0.9)`, slash: `${rW}, ${gW}, ${bW}`, glow: 'rgba(0,0,0,0.6)' };
  } else {
    rW = Math.min(255, rW + 20); gW = Math.min(255, gW + 20); bW = Math.min(255, bW + 20);
    return { fill: `rgba(${rW}, ${gW}, ${bW}, 0.08)`, stroke: `rgba(${rW}, ${gW}, ${bW}, 0.8)`, slash: `${rW}, ${gW}, ${bW}`, glow: `rgb(${rW}, ${gW}, ${bW})` };
  }
};

const TARGET_NAMES = { nearest: "Người Đá Gần Nhất", lowest_hp: "Bắt Nạt Kẻ Yếu", tankiest: "Thử Thách Độ Trâu", counter: "Gọt Mộc Tìm Khắc Hệ" };
const CAMP_NAMES = { attack: "Nhiệt Huyết Tuổi Trẻ", top5: "Bảo Toàn (Top 5)", top3: "Chờ Thời (Top 3)", top2: "Nhẫn Nhịn (Top 2)" };

export default function App() {
  const[gameState, setGameState] = useState(null);
  const[started, setStarted] = useState(false);
  const[muted, setMuted] = useState(false);
  
  const[globalHostPwd, setGlobalHostPwd] = useState('');
  const spokenLogs = useRef(new Set());
  const prevPhase = useRef('');

  useEffect(() => {
    const unlockAudio = () => {
      sfx.init(); document.removeEventListener('click', unlockAudio);
    };
    document.addEventListener('click', unlockAudio);
    return () => document.removeEventListener('click', unlockAudio);
  },[]);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setGameState(data);
      
      if (data.phase === 'reveal' && prevPhase.current !== 'reveal' && started) {
        humanVoice.shout('reveal');
      }
      
      if (data.phase === 'finished' && prevPhase.current === 'playing') {
          if (window.speechSynthesis) window.speechSynthesis.cancel();
      }
      
      prevPhase.current = data.phase;
      
      if(data.events && started) {
        data.events.forEach(ev => {
          if(ev.type === 'attack') sfx.play('attack', ev.weapon);
          if(ev.type === 'dodge') sfx.play('dodge'); 
          if(ev.type === 'heal') sfx.play('heal');
          if(ev.type === 'death') sfx.play('death');
          if(ev.type === 'win') sfx.play('win');
        });
      }

      if(data.logs.length > 0 && started) {
        const topLog = data.logs[0];
        if(!spokenLogs.current.has(topLog)) {
          spokenLogs.current.add(topLog);
          if(topLog.includes("💀") || topLog.includes("🏆") || topLog.includes("🎤") || topLog.includes("💥") || topLog.includes("☠️") || topLog.includes("💉") || topLog.includes("🎁") || topLog.includes("🔥") || topLog.includes("⚠️") || topLog.includes("🛑")) {
            speakLog(topLog, data.config.language, muted);
          }
        }
      }
    };
    return () => ws.close();
  },[started, muted]);

  const handleStartGameClick = () => { sfx.init(); setStarted(true); };

  if (!started) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white flex-col p-4 md:p-8">
        {/* Nâng cấp max-w-4xl lên max-w-6xl để Panel rộng và hoành tráng hơn */}
        <div className="max-w-6xl w-full bg-gray-900 border border-gray-700 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.8)] p-8 md:p-12 flex flex-col items-center relative overflow-hidden">
          <div className="absolute top-[-50px] left-[-50px] w-64 h-64 bg-blue-600 opacity-10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute bottom-[-50px] right-[-50px] w-64 h-64 bg-red-600 opacity-10 rounded-full blur-3xl pointer-events-none"></div>
          
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black mb-2 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-500 text-center uppercase tracking-widest drop-shadow-md z-10">
            TRẬN CHIẾN SINH TỒN
          </h1>
          <p className="text-gray-400 text-lg md:text-xl mb-10 font-semibold tracking-widest z-10 border-b border-gray-700 pb-4 w-full text-center">
            [ SURVIRAL BATTLE ROYALE - AUTO-BATTLER ]
          </p>

          {/* Tăng khoảng cách gap-6 lên gap-8 để nội dung dễ thở hơn */}
          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-8 mb-12 z-10 text-sm md:text-base">
            <div className="bg-gray-800/80 p-6 md:p-8 rounded-xl border-l-4 border-blue-500 shadow-inner hover:bg-gray-800 transition-colors">
              <h3 className="font-bold text-blue-400 mb-2 text-lg md:text-xl uppercase">🤖 Tự Động Chiến Đấu</h3>
              <p className="text-gray-300 leading-relaxed text-justify">
                Nhiệm vụ của bạn chỉ là <b>Đăng ký</b> trang bị và <b>Lập trình não bộ AI</b> cho nhân vật (chọn mục tiêu, cài đặt trốn tìm). Khi trận đấu bắt đầu, các nhân vật sẽ tự động tẩn nhau mà không cần thao tác tay.
              </p>
            </div>

            <div className="bg-gray-800/80 p-6 md:p-8 rounded-xl border-l-4 border-red-500 shadow-inner hover:bg-gray-800 transition-colors">
              <h3 className="font-bold text-red-400 mb-2 text-lg md:text-xl uppercase">⚔️ Khắc Hệ & Nhân Phẩm</h3>
              <p className="text-gray-300 leading-relaxed text-justify">
                Vũ khí khắc chế khiên sẽ x2 sát thương! Ngoài ra, hệ thống tích hợp <b>Chí mạng</b> và <b>Né đòn</b> (Dodge). Tốc độ di chuyển phụ thuộc vào độ nặng trang bị mang theo.
              </p>
            </div>

            <div className="bg-gray-800/80 p-6 md:p-8 rounded-xl border-l-4 border-green-500 shadow-inner hover:bg-gray-800 transition-colors">
              <h3 className="font-bold text-green-400 mb-2 text-lg md:text-xl uppercase">🏃 Sinh Tồn Khắc Nghiệt</h3>
              <p className="text-gray-300 leading-relaxed text-justify">
                Vòng bo khí độc thu hẹp liên tục! Hãy lợi dụng <b>Bụi Cỏ</b> để tàng hình trước AI của địch, hoặc liều mạng chạy ra loot <b>Hộp Tiếp Tế (Thính)</b> từ trên trời rơi xuống để hồi máu.
              </p>
            </div>

            <div className="bg-gray-800/80 p-6 md:p-8 rounded-xl border-l-4 border-yellow-500 shadow-inner hover:bg-gray-800 transition-colors">
              <h3 className="font-bold text-yellow-400 mb-2 text-lg md:text-xl uppercase">🎙️ Bình Luận Viên Tấu Hài</h3>
              <p className="text-gray-300 leading-relaxed text-justify">
                Toàn bộ diễn biến trận đấu, kỹ năng chạy bo, hay thói hèn nhát núp lùm của bạn đều sẽ được <b>Caster AI</b> bóc phốt và bình luận trực tiếp. <br/><span className="text-xs text-yellow-500 font-bold">* Khuyên dùng Edge/Chrome để MC đọc mượt nhất.</span>
              </p>
            </div>
          </div>

          <button onClick={handleStartGameClick} className="bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white text-2xl md:text-3xl font-black py-4 px-12 md:px-16 rounded-full animate-bounce shadow-[0_0_30px_rgba(34,197,94,0.5)] z-10 transition-transform hover:scale-110 border-2 border-green-400">
            🎮 VÀO SẢNH CHỜ NGAY
          </button>
        </div>
      </div>
    );
  }

  if (!gameState) return <div className="flex h-screen items-center justify-center text-xl text-white">Đang tải cấu hình máy chủ...</div>;

  sfx.muted = muted; humanVoice.muted = muted;

  const aliveCount = Object.values(gameState.players || {}).filter(p=>p.alive).length;
  const zoneRadius = Math.floor(gameState.zone?.r || 0);
  const isPlaying = gameState.phase === 'playing';

  return (
    <div className={`w-full bg-gray-900 text-white flex flex-col ${gameState.phase === 'playing' ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      <header className="shrink-0 bg-gray-800 p-3 shadow-md flex justify-between items-center z-10 relative border-b border-gray-700">
        <div className="flex-1"><h1 className="text-2xl font-bold text-yellow-400 truncate">{gameState.config.room_name}</h1></div>
        {isPlaying && (
            <div className="flex-1 flex justify-center">
                <div className="flex gap-6 bg-gray-900/80 px-5 py-1.5 rounded-full border border-gray-600 font-mono text-base font-bold shadow-inner">
                    <div>Trạng thái: <span className="text-green-400">{aliveCount} Sống</span></div>
                    <div className="w-px bg-gray-600"></div>
                    <div>Bo: <span className="text-red-400">{zoneRadius}px</span></div>
                </div>
            </div>
        )}
        <div className="flex-1 flex justify-end">
            <button onClick={() => setMuted(!muted)} className={`p-2 rounded font-bold ${muted ? 'bg-red-600' : 'bg-green-600'}`}>
            {muted ? "🔇 TẮT ÂM" : "🔊 BẬT ÂM"}
            </button>
        </div>
      </header>

      <main className={`flex-1 w-full flex ${gameState.phase === 'playing' ? 'min-h-0 overflow-hidden' : ''}`}>
        {gameState.phase === 'waiting' && <Phase1 gameState={gameState} hostPwd={globalHostPwd} setHostPwd={setGlobalHostPwd} />}
        {gameState.phase === 'strategy' && <Phase2 gameState={gameState} hostPwd={globalHostPwd} setHostPwd={setGlobalHostPwd} />}
        {gameState.phase === 'reveal' && <PhaseReveal gameState={gameState} hostPwd={globalHostPwd} />}
        {gameState.phase === 'playing' && <Phase3 gameState={gameState} hostPwd={globalHostPwd} />}
        {gameState.phase === 'finished' && <PhaseFinished gameState={gameState} />}
      </main>
    </div>
  );
}

function Phase1({ gameState, hostPwd, setHostPwd }) {
  const[name, setName] = useState(''); const[pwd, setPwd] = useState('');
  const[weapon, setWeapon] = useState('sword'); const[shield, setShield] = useState('wood_shield');
  const[localConfig, setLocalConfig] = useState(gameState.config);
  
  const WEAPONS = gameState.config.weapons; const SHIELDS = gameState.config.shields;

  const handleRegister = async (e) => {
    e.preventDefault(); if (!name || !pwd) return alert("Nhập tên và mật khẩu!");
    const res = await fetch(`${API_URL}/register`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ name, pwd, weapon, shield }) });
    const d = await res.json(); if(d.error) alert(d.error); else alert("Đăng ký thành công!");
  };

  const saveConfig = async () => {
    await fetch(`${API_URL}/config`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(localConfig) });
    alert("Đã lưu cấu hình lên Server!");
  };

  return (
    <div className="p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-y-auto">
      <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 h-fit shadow-xl">
        <h2 className="text-xl font-bold mb-4 text-blue-400">1. Ghi Danh (Đăng ký)</h2>
        <form onSubmit={handleRegister} className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-gray-400 mt-2">Tên hiển thị (Tên ingame)</label>
          <input className="p-2 mb-2 bg-gray-700 rounded outline-none" placeholder="VD: Sếp Tổng" value={name} onChange={e=>setName(e.target.value)} />
          
          <label className="text-sm font-semibold text-gray-400">Mật khẩu cá nhân (Dùng đổi chiến thuật)</label>
          <input className="p-2 mb-2 bg-gray-700 rounded outline-none" placeholder="VD: 123456" type="password" value={pwd} onChange={e=>setPwd(e.target.value)} />
          
          <label className="text-sm font-semibold text-gray-400 mt-2 flex justify-between items-center">
            <span>Chọn Vũ Khí chiến đấu</span>
            <span className="text-xs text-green-400 font-bold animate-pulse">🔊 Bấm nghe thử</span>
          </label>
          <select className="p-2 mb-2 bg-gray-700 rounded cursor-pointer" value={weapon} onChange={(e)=>{setWeapon(e.target.value); sfx.play('attack', e.target.value);}}>
            {Object.entries(WEAPONS).map(([k,v]) => <option key={k} value={k}>{v.e} {v.n}</option>)}
          </select>
          
          <label className="text-sm font-semibold text-gray-400 mt-2">Chọn Loại Khiên (Phòng thủ)</label>
          <select className="p-2 mb-2 bg-gray-700 rounded cursor-pointer" value={shield} onChange={e=>setShield(e.target.value)}>
            {Object.entries(SHIELDS).map(([k,v]) => <option key={k} value={k}>{v.e} {v.n}</option>)}
          </select>

          <button className="bg-blue-600 hover:bg-blue-500 py-3 mt-4 rounded font-bold shadow-lg">XÁC NHẬN THAM GIA</button>
        </form>
        
        <div className="mt-8 border-t border-gray-700 pt-4">
          <h3 className="font-bold text-green-400 mb-2">Người đang chờ ({Object.keys(gameState.players).length}):</h3>
          <div className="flex flex-wrap gap-2">
            {Object.values(gameState.players).map(p => <span key={p.name} className="px-2 py-1 bg-gray-700 rounded text-sm shadow-sm border border-gray-600">{p.name}</span>)}
          </div>
        </div>
      </div>

      <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 h-[650px] overflow-y-auto custom-scrollbar shadow-xl">
        <h2 className="text-2xl font-bold mb-4 text-yellow-400 border-b border-gray-600 pb-2">📖 Bí Kíp Sinh Tồn</h2>
        <div className="text-sm space-y-4 text-gray-300">
           <p>1. <b>Tốc độ</b> tỉ lệ nghịch với cân nặng trang bị.</p>
           <p>2. Chọn đúng <b>Vũ Khí khắc hệ Khiên</b> của địch sẽ nhân đôi sát thương!</p>
           <p>3. Trong Game có <b>Bụi Cỏ (Tàng Hình)</b> và <b>Thính (Hồi 150 máu)</b>.</p>
           {Object.values(WEAPONS).map(v => <div key={v.n} className="bg-gray-700 p-2 rounded">{v.e} <b>{v.n}</b>: Đam {v.dmg} | CD {v.cd} <br/><span className="text-xs text-yellow-400">Crit {v.crit*100}%</span></div>)}
        </div>
      </div>

      <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 h-fit shadow-xl">
        <h2 className="text-xl font-bold mb-4 text-purple-400">👑 Cài Đặt</h2>
        <label className="text-sm font-semibold text-gray-400 block mb-1">Mật khẩu Admin</label>
        <input className="p-2 w-full bg-gray-700 rounded mb-4 outline-none" placeholder="Nhập pass Host (dev123)" type="password" value={hostPwd} onChange={e=>setHostPwd(e.target.value)} />
        
        {hostPwd === 'dev123' && (
          <div className="flex flex-col gap-3 animate-fade-in border-t border-gray-700 pt-4">
            <label className="text-sm font-semibold text-gray-400 block -mb-2">Tên Phòng Đấu</label>
            <input className="p-2 bg-gray-700 rounded" value={localConfig.room_name} onChange={e=>setLocalConfig({...localConfig, room_name: e.target.value})} placeholder="Tên phòng" />
            
            <div className="flex gap-4">
              <div className="flex-1">
                 <label className="text-sm font-semibold text-gray-400 block mb-1">Chiều ngang (Width)</label>
                 <input type="number" className="p-2 bg-gray-700 rounded w-full" value={localConfig.map_width} onChange={e=>setLocalConfig({...localConfig, map_width: parseInt(e.target.value)})} title="Chiều rộng Pixel"/>
              </div>
              <div className="flex-1">
                 <label className="text-sm font-semibold text-gray-400 block mb-1">Chiều dọc (Height)</label>
                 <input type="number" className="p-2 bg-gray-700 rounded w-full" value={localConfig.map_height} onChange={e=>setLocalConfig({...localConfig, map_height: parseInt(e.target.value)})} title="Chiều cao Pixel"/>
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="flex-1">
                 <label className="text-sm font-semibold text-gray-400 block mb-1">Màu nền Bo</label>
                 <input type="color" className="p-1 bg-gray-700 rounded w-full h-10 cursor-pointer" value={localConfig.bg_color} onChange={e=>setLocalConfig({...localConfig, bg_color: e.target.value})} title="Màu nền" />
              </div>
              <div className="flex-1">
                 <label className="text-sm font-semibold text-gray-400 block mb-1">Ngôn ngữ MC</label>
                 <select className="p-2 bg-gray-700 rounded w-full h-10" value={localConfig.language} onChange={e=>setLocalConfig({...localConfig, language: e.target.value})}><option value="vi">Tiếng Việt</option><option value="en">English</option></select>
              </div>
            </div>
            
            <button onClick={saveConfig} className="bg-purple-600 hover:bg-purple-500 py-2 rounded font-bold mt-2">💾 LƯU SETTING</button>
            <div className="flex gap-2 mt-2">
              <button onClick={()=>fetch(`${API_URL}/bots`,{method:'POST'})} className="flex-1 bg-gray-600 hover:bg-gray-500 py-2 rounded text-sm font-bold">🤖 Thêm 10 Bots</button>
              <button onClick={()=>fetch(`${API_URL}/clear_players`,{method:'POST'})} className="flex-1 bg-red-900 hover:bg-red-800 py-2 rounded text-sm font-bold">🗑️ Xóa Tất Cả</button>
            </div>
            <button onClick={()=>fetch(`${API_URL}/phase/strategy`,{method:'POST'})} className="bg-red-600 hover:bg-red-500 py-3 rounded font-bold text-lg mt-2 animate-pulse">🔥 VÀO LẬP CHIẾN THUẬT</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Phase2({ gameState, hostPwd, setHostPwd }) {
  const [name, setName] = useState(''); const[pwd, setPwd] = useState('');
  const[targetRule, setTargetRule] = useState('nearest'); const[campRule, setCampRule] = useState('attack');

  const saveTactics = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API_URL}/strategy`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ name, pwd, target_rule: targetRule, camp_rule: campRule }) });
    const d = await res.json(); if(d.error) alert(d.error); else alert("Cài AI thành công!");
  };

  return (
    <div className="flex flex-col w-full items-center p-8 overflow-y-auto">
      <h2 className="text-4xl font-bold mb-2 text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]">THỜI GIAN HỘI Ý CHIẾN THUẬT</h2>
      <div className="text-6xl font-mono text-yellow-400 mb-6 drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]">{gameState.timer}s</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
        <div className="bg-gray-800 p-8 rounded-xl border border-gray-700 shadow-2xl flex flex-col justify-between">
            <h3 className="text-xl font-bold mb-4 text-center text-blue-400">Thiết lập Não Bộ AI</h3>
            <form onSubmit={saveTactics} className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-400">Xác nhận Tên của bạn</label>
              <input className="p-3 mb-2 bg-gray-700 rounded outline-none border border-transparent" placeholder="Tên lúc nãy đã đăng ký" value={name} onChange={e=>setName(e.target.value)} />
              
              <label className="text-sm font-semibold text-gray-400">Nhập Mật khẩu cá nhân</label>
              <input className="p-3 mb-2 bg-gray-700 rounded outline-none border border-transparent" placeholder="Pass đã đăng ký" type="password" value={pwd} onChange={e=>setPwd(e.target.value)} />
              
              <label className="text-sm font-semibold text-gray-400 mt-2">1. Mục tiêu ưu tiên tấn công</label>
              <select className="p-3 mb-2 bg-gray-700 rounded cursor-pointer" value={targetRule} onChange={e=>setTargetRule(e.target.value)}>
                <option value="nearest">Người Đá Gần Nhất (Khuyên dùng Cận chiến)</option><option value="lowest_hp">Bắt Nạt Kẻ Yếu (Móc lốp hôi của)</option><option value="tankiest">Thử Thách Độ Trâu (Rất lỳ)</option><option value="counter">Gọt Mộc Tìm Khắc Hệ (IQ 200)</option>
              </select>
              
              <label className="text-sm font-semibold text-gray-400 mt-2">2. Chiến thuật Sinh tồn</label>
              <select className="p-3 mb-2 bg-gray-700 rounded cursor-pointer" value={campRule} onChange={e=>setCampRule(e.target.value)}>
                <option value="attack">Nhiệt Huyết Tuổi Trẻ (Thích va chạm)</option><option value="top5">Bảo Toàn Lực Lượng (Chờ Top 5)</option><option value="top3">Nằm Im Chờ Thời (Chờ Top 3)</option><option value="top2">Nhẫn Nhịn Tới Cùng (Chờ Chung kết)</option>
              </select>
              
              <button className="bg-green-600 hover:bg-green-500 py-4 mt-6 rounded font-bold text-lg uppercase tracking-wider shadow-lg">LƯU CHỈ THỊ AI</button>
            </form>
        </div>
        <div className="bg-gray-800 p-8 rounded-xl border border-purple-500 shadow-2xl flex flex-col justify-center">
          <h3 className="text-xl font-bold mb-4 text-center text-purple-400">👑 Quyền Host</h3>
          <label className="text-sm font-semibold text-gray-400 block mb-1 text-center">Xác nhận Host để bỏ qua chờ</label>
          <input className="p-3 bg-gray-700 rounded mb-4 text-center outline-none" placeholder="Pass (dev123)" type="password" value={hostPwd} onChange={e=>setHostPwd(e.target.value)} />
          {hostPwd === 'dev123' && <button onClick={()=>fetch(`${API_URL}/phase/reveal`, {method: "POST"})} className="bg-red-600 hover:bg-red-500 py-4 rounded font-bold text-white uppercase animate-pulse shadow-lg">⏩ Hé Lộ Bảng Phong Thần</button>}
        </div>
      </div>
    </div>
  );
}

function PhaseReveal({ gameState, hostPwd }) {
  const WEAPONS = gameState.config.weapons; const SHIELDS = gameState.config.shields;
  return (
    <div className="flex flex-col w-full h-full p-8 overflow-hidden bg-gray-900">
      <div className="flex justify-between items-end mb-6">
        <div><h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-500 uppercase tracking-widest">Bảng Phong Thần & Chiến Thuật</h2></div>
        <div className="flex items-center gap-6">
          <div className="text-5xl font-mono text-red-500 animate-pulse font-bold">{gameState.reveal_timer}s</div>
          {hostPwd === 'dev123' && <button onClick={()=>fetch(`${API_URL}/phase/playing`, {method: "POST"})} className="bg-purple-600 hover:bg-purple-500 py-2 px-4 rounded font-bold shadow-lg">⏩ BẮT ĐẦU VÀO ĐẤU</button>}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pb-10 custom-scrollbar pr-2">
        {Object.values(gameState.players).map((p, idx) => (
          <div key={idx} className="bg-gray-800 border-2 border-gray-700 p-4 rounded-xl shadow-lg flex flex-col gap-3 relative overflow-hidden group">
            <div className="flex justify-between items-center border-b border-gray-700 pb-2">
              <span className="font-bold text-lg text-blue-300">{p.name}</span>
              <span className="text-2xl drop-shadow-md">{WEAPONS[p.weapon].e} {SHIELDS[p.shield].e}</span>
            </div>
            <div className="flex flex-col gap-2">
              <div className="bg-gray-900 p-2 rounded border border-gray-700"><span className="text-xs text-gray-500 block uppercase font-bold">🎯 Ưu Tiên</span><span className="font-semibold text-gray-300">{TARGET_NAMES[p.target_rule]}</span></div>
              <div className="bg-gray-900 p-2 rounded border border-gray-700"><span className="text-xs text-gray-500 block uppercase font-bold">🏃 Hành Động</span><span className="font-semibold text-gray-300">{CAMP_NAMES[p.camp_rule]}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Phase3({ gameState, hostPwd }) {
  const canvasRef = useRef(null); const vfxRef = useRef([]); 
  const WEAPONS = gameState.config.weapons; const SHIELDS = gameState.config.shields;
  const cardW = gameState.config.character_settings.card_width; const cardH = gameState.config.character_settings.card_height;

  useEffect(() => {
    if (gameState.events) {
      gameState.events.forEach(ev => {
        if (ev.type === 'attack') {
          vfxRef.current.push({ type: 'slash', x: ev.x, y: ev.y, tx: ev.tx, ty: ev.ty, weapon: ev.weapon, life: 8 });
          if(ev.is_crit) vfxRef.current.push({ type: 'text', x: ev.tx, y: ev.ty - 40, text: `💥 BẠO KÍCH! -${ev.dmg}`, color: '#ef4444', life: 30 });
          else vfxRef.current.push({ type: 'text', x: ev.tx, y: ev.ty - 40, text: `-${ev.dmg}`, color: '#fca5a5', life: 20 });
        }
        if (ev.type === 'dodge') vfxRef.current.push({ type: 'text', x: ev.x, y: ev.y - 40, text: `💨 HỤT!`, color: '#6ee7b7', life: 30 });
        if (ev.type === 'heal') vfxRef.current.push({ type: 'text', x: ev.x, y: ev.y - 50, text: ev.text, color: '#4ade80', life: 40 });
        if (ev.type === 'hurt') for (let i = 0; i < 8; i++) vfxRef.current.push({ type: 'blood', x: ev.x, y: ev.y, vx: (Math.random()-0.5)*15, vy: (Math.random()-0.5)*15, life: 10+Math.random()*5 });
      });
    }

    const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d');
    const cw = gameState.config.map_width; const ch = gameState.config.map_height; const z = gameState.zone;
    
    ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, cw, ch);
    ctx.beginPath(); ctx.arc(z.x, z.y, Math.max(0, z.r), 0, Math.PI * 2);
    ctx.fillStyle = gameState.config.bg_color; ctx.shadowBlur = 50; ctx.shadowColor = '#EF4444'; ctx.fill(); ctx.shadowBlur = 0;

    let cBg = gameState.config.bg_color.substring(1).split(''); if(cBg.length === 3) cBg = [cBg[0], cBg[0], cBg[1], cBg[1], cBg[2], cBg[2]]; cBg = '0x' + cBg.join('');
    let isLightGrid = ((cBg >> 16) & 255) * 0.299 + ((cBg >> 8) & 255) * 0.587 + (cBg & 255) * 0.114 > 128;

    ctx.lineWidth = 1;
    for(let i=0; i<cw; i+=100) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,ch); ctx.strokeStyle = (Math.abs(i-z.x)<z.r && isLightGrid) ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.05)'; ctx.stroke(); }
    for(let i=0; i<ch; i+=100) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(cw,i); ctx.strokeStyle = (Math.abs(i-z.y)<z.r && isLightGrid) ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.05)'; ctx.stroke(); }
    ctx.beginPath(); ctx.arc(z.x, z.y, Math.max(0, z.r), 0, Math.PI * 2); ctx.strokeStyle = '#EF4444'; ctx.lineWidth = 6; ctx.stroke();

    if(gameState.bushes) gameState.bushes.forEach(b => { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(34, 197, 94, 0.75)'; ctx.fill(); ctx.strokeStyle = 'rgba(20, 83, 45, 0.9)'; ctx.lineWidth = 4; ctx.setLineDash([15, 20]); ctx.stroke(); ctx.setLineDash([]); });
    if(gameState.airdrops) gameState.airdrops.forEach(drop => { ctx.fillStyle = '#854d0e'; ctx.fillRect(drop.x - 15, drop.y - 15, 30, 30); ctx.fillStyle = '#ef4444'; ctx.fillRect(drop.x - 4, drop.y - 10, 8, 20); ctx.fillRect(drop.x - 10, drop.y - 4, 20, 8); ctx.strokeStyle = '#facc15'; ctx.shadowBlur = 15; ctx.shadowColor = '#facc15'; ctx.strokeRect(drop.x - 15, drop.y - 15, 30, 30); ctx.shadowBlur = 0; });

    Object.values(gameState.players).forEach(p => {
      if (!p.alive || p.in_bush) return;
      const w_data = WEAPONS[p.weapon];
      const dynColor = getDynamicColors(p.weapon, Math.hypot(p.x-z.x, p.y-z.y)>z.r ? '#111827' : gameState.config.bg_color);
      ctx.beginPath(); ctx.arc(p.x, p.y, w_data.max_rng, 0, Math.PI*2); ctx.fillStyle = dynColor.fill; ctx.fill(); 
      ctx.strokeStyle = dynColor.stroke; ctx.lineWidth = 1.5; ctx.shadowBlur = 10; ctx.shadowColor = dynColor.glow; ctx.stroke(); ctx.shadowBlur = 0;
    });

    gameState.projectiles.forEach(p => {
      if(p.type !== 'melee') { 
        ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI*2);
        let dColor = '#ffffff'; if(p.type === 'dagger') dColor = '#a855f7'; if(p.type === 'bow') dColor = '#eab308'; if(p.type === 'spear') dColor = '#3b82f6';
        ctx.fillStyle = dColor; ctx.shadowBlur = 15; ctx.shadowColor = dColor; ctx.fill(); ctx.shadowBlur = 0;
      }
    });

    Object.values(gameState.players).forEach(p => {
      if (!p.alive) {
        ctx.fillStyle = '#4B5563'; ctx.fillRect(p.x - 25, p.y - 25, 50, 50);
        ctx.fillStyle = 'red'; ctx.font = '30px Arial'; ctx.textAlign = 'center'; ctx.fillText('❌', p.x, p.y + 10);
        return;
      }

      ctx.save(); 
      if(p.in_bush) ctx.globalAlpha = 0.4; 
      const isBerserk = p.hp < (p.max_hp * 0.3); const cx = p.x - cardW / 2; const cy = p.y - cardH / 2;

      ctx.fillStyle = '#1F2937'; ctx.fillRect(cx, cy, cardW, cardH);
      ctx.strokeStyle = p.flash_red ? '#ff0000' : (isBerserk ? '#EF4444' : '#FBBF24');
      ctx.lineWidth = p.flash_red ? 6 : (isBerserk ? 4 : 2);
      if(p.flash_red) { ctx.shadowBlur = 25; ctx.shadowColor = '#ff0000'; }
      ctx.strokeRect(cx, cy, cardW, cardH); ctx.shadowBlur = 0; 

      ctx.fillStyle = 'white'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(p.name.length > 8 ? p.name.substring(0,8)+'..' : p.name, p.x, cy + 22);
      ctx.font = '32px sans-serif'; ctx.fillText(WEAPONS[p.weapon].e, p.x - 20, cy + 60); ctx.fillText(SHIELDS[p.shield].e, p.x + 20, cy + 60);

      const hpBoxX = cx + 8; const hpBoxY = cy + 80; const hpBoxW = cardW - 16; const hpBoxH = 16; 
      ctx.fillStyle = '#111827'; ctx.fillRect(hpBoxX, hpBoxY, hpBoxW, hpBoxH);
      ctx.fillStyle = isBerserk ? '#EF4444' : '#22C55E'; ctx.fillRect(hpBoxX, hpBoxY, hpBoxW * Math.max(0, p.hp/p.max_hp), hpBoxH);
      ctx.fillStyle = 'white'; ctx.font = 'bold 12px sans-serif'; ctx.fillText(`${Math.floor(p.hp)} HP`, p.x, hpBoxY + 12);
      ctx.restore(); 
    });

    let activeVfx =[];
    vfxRef.current.forEach(v => {
      if (v.type === 'slash') {
        ctx.beginPath(); ctx.moveTo(v.x, v.y); ctx.lineTo(v.tx, v.ty);
        const dynColor = getDynamicColors(v.weapon, (Math.hypot(v.x-z.x, v.y-z.y) > z.r) ? '#111827' : gameState.config.bg_color);
        ctx.strokeStyle = `rgba(${dynColor.slash}, ${v.life / 6})`; ctx.lineWidth = v.life * 3; ctx.shadowBlur = 15; ctx.shadowColor = dynColor.glow; ctx.stroke(); ctx.shadowBlur = 0;
      } 
      else if (v.type === 'blood') {
        ctx.beginPath(); ctx.arc(v.x, v.y, v.life / 1.5, 0, Math.PI*2); ctx.fillStyle = `rgba(220, 38, 38, ${v.life / 10})`; ctx.fill();
        v.x += v.vx; v.y += v.vy;
      }
      else if (v.type === 'text') {
        ctx.fillStyle = v.color; ctx.font = 'bold 20px "Courier New"'; ctx.textAlign = 'center';
        ctx.globalAlpha = Math.min(1, v.life / 20); ctx.shadowBlur = 4; ctx.shadowColor = '#000000'; ctx.fillText(v.text, v.x, v.y);
        ctx.globalAlpha = 1.0; ctx.shadowBlur = 0; v.y -= 1.5; 
      }
      v.life -= 1; if (v.life > 0) activeVfx.push(v);
    });
    vfxRef.current = activeVfx; 

  },[gameState]);

  return (
    <div className="flex w-full h-full overflow-hidden min-h-0">
      <div className="flex-1 bg-[#0b0f19] relative flex items-center justify-center p-2 min-h-0 border-r border-gray-700">
        <canvas ref={canvasRef} width={gameState.config.map_width} height={gameState.config.map_height} className="w-full h-full object-contain rounded shadow-[0_0_25px_rgba(0,0,0,0.8)]" />
      </div>

      <div className="w-96 bg-gray-800 flex flex-col shrink-0 h-full min-h-0">
        <div className="p-3 bg-gray-900 font-bold border-b border-gray-700 text-purple-400 flex items-center justify-between gap-2">
          <span>🎙️ Caster Panel (Live)</span>
          <button onClick={async () => { if(hostPwd==='dev123' || prompt("Pass:")==='dev123') await fetch(`${API_URL}/force_end`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({pwd:'dev123'})}); }} className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-xs uppercase shadow-md">🛑 Ngừng Trận</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 flex flex-col-reverse custom-scrollbar">
          {gameState.logs.map((log, i) => (
            <div key={i} className={`p-2 rounded text-sm font-mono border-l-2 ${log.includes('💀') || log.includes('🛑') || log.includes('☠️') ? 'border-red-500 bg-red-900/20 text-red-200' : log.includes('💥') || log.includes('🎤') ? 'border-yellow-500 bg-yellow-900/20 text-yellow-200' : log.includes('🎁') || log.includes('💉') ? 'border-green-500 bg-green-900/20 text-green-200' : 'border-blue-500 bg-gray-700'}`}>
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PhaseFinished({ gameState }) {
  const winner = Object.values(gameState.players).find(p => p.alive);
  const WEAPONS = gameState.config.weapons; const SHIELDS = gameState.config.shields;
  return (
    <div className="flex w-full items-center justify-center flex-col min-h-0 overflow-y-auto p-8">
      <div className="bg-gray-800 p-12 rounded-2xl border-4 border-yellow-500 text-center shadow-[0_0_50px_rgba(234,179,8,0.5)] max-w-4xl w-full">
        <div className="text-8xl mb-6 animate-bounce">🏆</div>
        <h2 className="text-5xl font-bold text-yellow-400 mb-2 uppercase">{winner ? winner.name : "HÒA NHAU"}</h2>
        <p className="text-xl text-gray-300 mb-8 font-semibold">Đã xuất sắc giành ngôi vị Quán quân!</p>
        
        {winner && (
          <div className="bg-gray-900 p-6 rounded-xl border border-gray-700 shadow-inner flex flex-col md:flex-row gap-8 text-left">
            <div className="flex-1 border-b md:border-b-0 md:border-r border-gray-700 pb-6 md:pb-0 md:pr-6">
                <h3 className="text-green-400 font-bold text-xl border-b border-gray-700 pb-2 mb-4">THÔNG SỐ BẢN THÂN</h3>
                <p className="text-lg mb-2">Trang bị: {WEAPONS[winner.weapon].e} + {SHIELDS[winner.shield].e}</p>
                <p className="text-lg mb-2">Máu còn lại: <strong className="text-green-400">{Math.floor(winner.hp)} / {winner.max_hp}</strong></p>
                <p className="text-lg mb-2">Mục tiêu: <strong className="text-yellow-400">{TARGET_NAMES[winner.target_rule]}</strong></p>
                <p className="text-lg">Sinh tồn: <strong className="text-yellow-400">{CAMP_NAMES[winner.camp_rule]}</strong></p>
            </div>
            <div className="flex-1">
                <h3 className="text-purple-400 font-bold text-xl border-b border-gray-700 pb-2 mb-4">THỐNG KÊ CHIẾN ĐẤU</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-gray-800 p-3 rounded border border-gray-700">
                        <span className="text-xs text-gray-400 block uppercase">Sát Thương Gây Ra</span>
                        <span className="text-xl font-bold text-red-400">💥 {Math.floor(winner.damage_dealt)}</span>
                    </div>
                    <div className="bg-gray-800 p-3 rounded border border-gray-700">
                        <span className="text-xs text-gray-400 block uppercase">Đã Gánh Chịu</span>
                        <span className="text-xl font-bold text-gray-300">🛡️ {Math.floor(winner.damage_taken)}</span>
                    </div>
                    <div className="bg-gray-800 p-3 rounded border border-gray-700">
                        <span className="text-xs text-gray-400 block uppercase">Nhặt Cứu Thương</span>
                        <span className="text-xl font-bold text-green-400">💉 {winner.heals_looted} Hộp</span>
                    </div>
                    <div className="bg-gray-800 p-3 rounded border border-gray-700">
                        <span className="text-xs text-gray-400 block uppercase">Hạ Gục Đối Thủ</span>
                        <span className="text-xl font-bold text-yellow-400">🩸 {winner.kills} Ng</span>
                    </div>
                </div>
                <div className="bg-gray-800 p-3 rounded border border-gray-700">
                    <span className="text-xs text-gray-400 block uppercase mb-1">Danh sách Nạn Nhân:</span>
                    <span className="text-sm font-semibold text-gray-200">
                        {winner.killed_names && winner.killed_names.length > 0 ? winner.killed_names.join(', ') : 'Rất hiền lành, chưa đánh bại ai!'}
                    </span>
                </div>
            </div>
          </div>
        )}
      </div>
      <button onClick={()=>fetch(`${API_URL}/phase/waiting`,{method:'POST'})} className="mt-8 bg-gray-700 hover:bg-gray-600 px-10 py-4 rounded-full font-bold text-xl transition-transform hover:scale-105">TRỞ VỀ LOBBY</button>
    </div>
  );
}