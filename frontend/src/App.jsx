import React, { useState, useEffect, useRef } from 'react';

// Tự động nhận diện chạy Local hay chạy trên mạng (Render/Vercel)
const isLocal = window.location.hostname === 'localhost';
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const host = window.location.host;

const API_URL = isLocal ? "http://localhost:8000/api" : `/api`;
const WS_URL = isLocal ? "ws://localhost:8000/ws" : `${protocol}//${host}/ws`;

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
      if (weapon === 'sword') { osc.type = 'square'; osc.frequency.setValueAtTime(1200, t); osc.frequency.exponentialRampToValueAtTime(400, t + 0.1); gain.gain.setValueAtTime(0.4, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1); osc.start(t); osc.stop(t + 0.1); const osc2 = this.ctx.createOscillator(); osc2.type = 'sawtooth'; osc2.frequency.setValueAtTime(800, t); osc2.frequency.exponentialRampToValueAtTime(200, t + 0.15); osc2.connect(gain); osc2.start(t); osc2.stop(t + 0.15); } 
      else if (weapon === 'spear') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(300, t); osc.frequency.exponentialRampToValueAtTime(50, t + 0.15); gain.gain.setValueAtTime(0.8, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15); osc.start(t); osc.stop(t + 0.15); } 
      else if (weapon === 'dagger') { osc.type = 'sine'; osc.frequency.setValueAtTime(2000, t); osc.frequency.exponentialRampToValueAtTime(500, t + 0.08); gain.gain.setValueAtTime(0.5, t); gain.gain.linearRampToValueAtTime(0.01, t + 0.08); osc.start(t); osc.stop(t + 0.08); } 
      else if (weapon === 'bow') { osc.type = 'triangle'; osc.frequency.setValueAtTime(900, t); osc.frequency.exponentialRampToValueAtTime(100, t + 0.15); gain.gain.setValueAtTime(0.7, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15); osc.start(t); osc.stop(t + 0.15); } 
      else if (weapon === 'hammer') { osc.type = 'square'; osc.frequency.setValueAtTime(150, t); osc.frequency.exponentialRampToValueAtTime(20, t + 0.25); gain.gain.setValueAtTime(1.0, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25); osc.start(t); osc.stop(t + 0.25); }
    } 
    else if (type === 'death') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, t); osc.frequency.exponentialRampToValueAtTime(30, t + 0.5); gain.gain.setValueAtTime(0.7, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5); osc.start(t); osc.stop(t + 0.5); }
    else if (type === 'win') { osc.type = 'square'; [440, 554, 659].forEach((f, i) => osc.frequency.setValueAtTime(f, t + i * 0.15)); gain.gain.setValueAtTime(0.4, t); gain.gain.linearRampToValueAtTime(0, t + 1.2); osc.start(t); osc.stop(t + 1.2); }
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
    u.lang = 'vi-VN'; u.pitch = 1.1; u.rate = 1.3; this.synth.speak(u);
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
  msg.rate = 1.55; msg.pitch = 1.0 + (Math.random() * 0.3 - 0.15); 
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
const CAMP_NAMES = { attack: "Nhiệt Huyết Tuổi Trẻ", top5: "Bảo Toàn Lực Lượng", top3: "Nằm Im Chờ Thời", top2: "Nhẫn Nhịn Tới Cùng" };

export default function App() {
  const[gameState, setGameState] = useState(null);
  const[started, setStarted] = useState(false);
  const[muted, setMuted] = useState(false);
  
  const[globalHostPwd, setGlobalHostPwd] = useState('');
  const spokenLogs = useRef(new Set());
  const prevPhase = useRef('');

  useEffect(() => {
    const unlockAudio = () => { sfx.init(); document.removeEventListener('click', unlockAudio); };
    document.addEventListener('click', unlockAudio);
    return () => document.removeEventListener('click', unlockAudio);
  },[]);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setGameState(data);
      
      if (data.phase === 'reveal' && prevPhase.current !== 'reveal' && started) humanVoice.shout('reveal');
      if (data.phase === 'finished' && prevPhase.current === 'playing') if (window.speechSynthesis) window.speechSynthesis.cancel();
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
        <div className="max-w-6xl w-full bg-gray-900 border border-gray-700 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.8)] p-6 md:p-12 flex flex-col items-center relative overflow-hidden">
          <div className="absolute top-[-50px] left-[-50px] w-64 h-64 bg-blue-600 opacity-10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute bottom-[-50px] right-[-50px] w-64 h-64 bg-red-600 opacity-10 rounded-full blur-3xl pointer-events-none"></div>
          
          <h1 className="text-3xl md:text-5xl lg:text-7xl font-black mb-2 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-500 text-center uppercase tracking-widest drop-shadow-md z-10">
            TRẬN CHIẾN SINH TỒN
          </h1>
          <p className="text-gray-400 text-sm md:text-xl mb-8 md:mb-10 font-semibold tracking-widest z-10 border-b border-gray-700 pb-4 w-full text-center">
            [ SURVIRAL BATTLE ROYALE - AUTO-BATTLER ]
          </p>

          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 mb-8 md:mb-12 z-10 text-xs md:text-base">
            <div className="bg-gray-800/80 p-5 md:p-8 rounded-xl border-l-4 border-blue-500 shadow-inner hover:bg-gray-800 transition-colors">
              <h3 className="font-bold text-blue-400 mb-2 text-base md:text-xl uppercase">🤖 Tự Động Chiến Đấu</h3>
              <p className="text-gray-300 leading-relaxed text-justify">
                Nhiệm vụ của bạn chỉ là <b>Đăng ký</b> trang bị và <b>Lập trình não bộ AI</b>. Khi trận đấu bắt đầu, các nhân vật sẽ tự động xử lý nhau mà không cần thao tác tay.
              </p>
            </div>
            <div className="bg-gray-800/80 p-5 md:p-8 rounded-xl border-l-4 border-red-500 shadow-inner hover:bg-gray-800 transition-colors">
              <h3 className="font-bold text-red-400 mb-2 text-base md:text-xl uppercase">⚔️ Khắc Hệ & Nhân Phẩm</h3>
              <p className="text-gray-300 leading-relaxed text-justify">
                Vũ khí khắc chế khiên sẽ x2 sát thương! Ngoài ra, hệ thống tích hợp <b>Chí mạng</b> và <b>Né đòn</b>. Tốc độ phụ thuộc vào độ nặng trang bị mang theo.
              </p>
            </div>
            <div className="bg-gray-800/80 p-5 md:p-8 rounded-xl border-l-4 border-green-500 shadow-inner hover:bg-gray-800 transition-colors">
              <h3 className="font-bold text-green-400 mb-2 text-base md:text-xl uppercase">🏃 Sinh Tồn Khắc Nghiệt</h3>
              <p className="text-gray-300 leading-relaxed text-justify">
                Vòng bo khí độc thu hẹp liên tục! Hãy núp <b>Bụi Cỏ</b> để tàng hình, hoặc liều mạng chạy ra loot <b>Hộp Tiếp Tế (Thính)</b> để hồi máu.
              </p>
            </div>
            <div className="bg-gray-800/80 p-5 md:p-8 rounded-xl border-l-4 border-yellow-500 shadow-inner hover:bg-gray-800 transition-colors">
              <h3 className="font-bold text-yellow-400 mb-2 text-base md:text-xl uppercase">🎙️ Bình Luận Viên Tấu Hài</h3>
              <p className="text-gray-300 leading-relaxed text-justify">
                Toàn bộ diễn biến trận đấu, kỹ năng chạy bo, hay thói núp lùm của bạn đều sẽ được <b>Caster AI</b> bóc phốt và bình luận trực tiếp.
              </p>
            </div>
          </div>
          <button onClick={handleStartGameClick} className="bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white text-xl md:text-3xl font-black py-4 px-8 md:px-16 rounded-full animate-bounce shadow-[0_0_30px_rgba(34,197,94,0.5)] z-10 transition-transform hover:scale-105 border-2 border-green-400 text-center w-full md:w-auto">
            🎮 VÀO SẢNH CHỜ NGAY
          </button>
        </div>
      </div>
    );
  }

  if (!gameState) return <div className="flex h-screen items-center justify-center text-sm md:text-xl text-white">Đang kết nối Máy Chủ...</div>;
  sfx.muted = muted; humanVoice.muted = muted;

  const aliveCount = Object.values(gameState.players || {}).filter(p=>p.alive).length;
  const zoneRadius = Math.floor(gameState.zone?.r || 0);
  const isPlaying = gameState.phase === 'playing';

  return (
    <div className={`w-full bg-gray-900 text-white flex flex-col ${gameState.phase === 'playing' ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      <header className="shrink-0 bg-gray-800 p-2 md:p-3 shadow-md flex justify-between items-center z-10 relative border-b border-gray-700">
        <div className="flex-1 w-1/3"><h1 className="text-lg md:text-2xl font-bold text-yellow-400 truncate">{gameState.config.room_name}</h1></div>
        {isPlaying && (
            <div className="flex-1 flex justify-center w-1/3">
                <div className="flex gap-2 md:gap-6 bg-gray-900/80 px-3 md:px-5 py-1.5 rounded-full border border-gray-600 font-mono text-[10px] md:text-base font-bold shadow-inner">
                    <div className="truncate"><span className="text-green-400">{aliveCount} Sống</span></div>
                    <div className="w-px bg-gray-600"></div>
                    <div className="truncate">Bo: <span className="text-red-400">{zoneRadius}</span></div>
                </div>
            </div>
        )}
        <div className="flex-1 flex justify-end w-1/3">
            <button onClick={() => setMuted(!muted)} className={`p-1.5 md:p-2 rounded text-[10px] md:text-sm font-bold ${muted ? 'bg-red-600' : 'bg-green-600'}`}>
            {muted ? "🔇 TẮT ÂM" : "🔊 BẬT ÂM"}
            </button>
        </div>
      </header>

      <main className={`flex-1 w-full flex flex-col ${gameState.phase === 'playing' ? 'min-h-0 overflow-hidden' : ''}`}>
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
    <div className="p-4 md:p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-y-auto">
      <div className="bg-gray-800 p-4 md:p-6 rounded-lg border border-gray-700 h-fit shadow-xl">
        <h2 className="text-lg md:text-xl font-bold mb-4 text-blue-400">1. Ghi Danh (Đăng ký)</h2>
        <form onSubmit={handleRegister} className="flex flex-col gap-1 text-sm md:text-base">
          <label className="text-xs md:text-sm font-semibold text-gray-400 mt-2">Tên hiển thị (Tên ingame)</label>
          <input className="p-2 md:p-3 mb-2 bg-gray-700 rounded outline-none" placeholder="VD: Sếp Tổng" value={name} onChange={e=>setName(e.target.value)} />
          
          <label className="text-xs md:text-sm font-semibold text-gray-400">Mật khẩu cá nhân (Dùng đổi AI sau)</label>
          <input className="p-2 md:p-3 mb-2 bg-gray-700 rounded outline-none" placeholder="VD: 123456" type="password" value={pwd} onChange={e=>setPwd(e.target.value)} />
          
          <label className="text-xs md:text-sm font-semibold text-gray-400 mt-2 flex justify-between items-center">
            <span>Chọn Vũ Khí chiến đấu</span>
            <span className="text-[10px] md:text-xs text-green-400 font-bold animate-pulse">🔊 Bấm nghe thử</span>
          </label>
          <select className="p-2 md:p-3 mb-2 bg-gray-700 rounded cursor-pointer" value={weapon} onChange={(e)=>{setWeapon(e.target.value); sfx.play('attack', e.target.value);}}>
            {Object.entries(WEAPONS).map(([k,v]) => <option key={k} value={k}>{v.e} {v.n}</option>)}
          </select>
          
          <label className="text-xs md:text-sm font-semibold text-gray-400 mt-2">Chọn Loại Khiên (Phòng thủ)</label>
          <select className="p-2 md:p-3 mb-2 bg-gray-700 rounded cursor-pointer" value={shield} onChange={e=>setShield(e.target.value)}>
            {Object.entries(SHIELDS).map(([k,v]) => <option key={k} value={k}>{v.e} {v.n}</option>)}
          </select>

          <button className="bg-blue-600 hover:bg-blue-500 py-3 mt-4 rounded font-bold shadow-lg text-sm md:text-base">XÁC NHẬN THAM GIA</button>
        </form>
        
        <div className="mt-6 md:mt-8 border-t border-gray-700 pt-4">
          <h3 className="font-bold text-green-400 mb-2 text-sm md:text-base">Người đang chờ ({Object.keys(gameState.players).length}):</h3>
          <div className="flex flex-wrap gap-2">
            {Object.values(gameState.players).map(p => <span key={p.name} className="px-2 py-1 bg-gray-700 rounded text-xs md:text-sm shadow-sm border border-gray-600">{p.name}</span>)}
          </div>
        </div>
      </div>

      <div className="bg-gray-800 p-4 md:p-6 rounded-lg border border-gray-700 h-[400px] md:h-[650px] overflow-y-auto custom-scrollbar shadow-xl">
        <h2 className="text-xl md:text-2xl font-bold mb-4 text-yellow-400 border-b border-gray-600 pb-2">📖 Bí Kíp Sinh Tồn</h2>
        <div className="text-xs md:text-sm space-y-6 text-gray-300">
            <div className="bg-gray-700 p-3 rounded shadow-inner border-l-4 border-green-500">
                <h3 className="font-bold text-green-400 text-base mb-1">🏃 Tốc Độ Di Chuyển</h3>
                <p><b>Tốc độ chạy = 180 - (Cân nặng Vũ khí + Cân nặng Khiên)</b>. Mang đồ xịn thì khó né tên và chạy bo.</p>
            </div>
            <div className="bg-red-900/20 border border-red-800/50 p-3 rounded-lg">
                <h3 className="text-red-400 font-bold mb-2 text-base uppercase">⚔️ Cơ Chế Khắc Hệ (Nhân Đôi Đam)</h3>
                <p className="mb-2 text-gray-300">Khắc hệ là chìa khóa chiến thắng. Đánh trúng đối thủ bị khắc, <b>sát thương x2</b> trước khi tính giáp!</p>
                <div className="space-y-3 bg-black/40 p-3 rounded text-gray-400 italic">
                    <p><b>💡 Khắc hệ:</b> Kiếm dài (Đam 25) chém Khiên gỗ (Thủ 35%). Kiếm khắc Gỗ 👉 Đam x2 = 50. Trừ 35% thủ = <b>32.5 HP!</b></p>
                    <p className="border-t border-gray-700 pt-2"><b>💡 Bị khắc:</b> Cung (Đam 18) bắn Khiên thép (Thủ 65%). Mũi tên vỡ 👉 Đam giảm nửa = 9. Trừ 65% thủ = <b>3.1 HP!</b></p>
                </div>
            </div>
            <div>
                <h3 className="text-yellow-400 font-bold mb-3 text-base uppercase border-b border-gray-600 pb-1">🔫 Chỉ Số Vũ Khí</h3>
                <div className="grid gap-3">
                    {Object.entries(WEAPONS).map(([k, v]) => (
                        <div key={k} className="bg-gray-700 p-3 rounded flex flex-col gap-1 shadow-sm border border-gray-600">
                            <div className="flex items-center gap-2 border-b border-gray-600 pb-1 mb-1">
                                <span className="text-xl">{v.e}</span><span className="font-bold text-white text-base">{v.n}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-gray-300">
                                <span>💥 <b>Sát thương:</b> <span className="text-white">{v.dmg}</span></span>
                                <span>🎯 <b>Tầm vươn:</b> <span className="text-white">{v.min_rng}-{v.max_rng}px</span></span>
                                <span>⏱️ <b>Tốc vung:</b> <span className="text-white">{(v.cd_ticks * 0.1).toFixed(1)}s</span></span>
                                <span>⚖️ <b>Độ nặng:</b> <span className="text-white">{v.weight}</span></span>
                                <span className="text-yellow-400">⚡ <b>Chí mạng:</b> {Math.round(v.crit * 100)}%</span>
                                <span className="text-red-400">⚔️ <b>Khắc:</b> {Array.isArray(v.counters) ? v.counters.map(c => SHIELDS[c]?.n).join(', ') : SHIELDS[v.counters]?.n}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div>
                <h3 className="text-blue-400 font-bold mb-3 text-base uppercase border-b border-gray-600 pb-1">🛡️ Chỉ Số Phòng Cụ</h3>
                <div className="grid gap-3">
                    {Object.entries(SHIELDS).map(([k, v]) => (
                        <div key={k} className="bg-gray-700 p-3 rounded flex flex-col gap-1 shadow-sm border border-gray-600">
                            <div className="flex items-center gap-2 border-b border-gray-600 pb-1 mb-1">
                                <span className="text-xl">{v.e}</span><span className="font-bold text-white text-base">{v.n}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-gray-300">
                                <span>🛡️ <b>Giảm đam:</b> <span className="text-white">{Math.round(v.block * 100)}%</span></span>
                                <span className="text-green-400">💨 <b>Né đòn:</b> {Math.round(v.dodge * 100)}%</span>
                                <span>⚖️ <b>Độ nặng:</b> <span className="text-white">{v.weight}</span></span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      </div>

      <div className="bg-gray-800 p-4 md:p-6 rounded-lg border border-gray-700 h-fit shadow-xl">
        <h2 className="text-lg md:text-xl font-bold mb-4 text-purple-400">👑 Quyền Lực Host</h2>
        <label className="text-xs md:text-sm font-semibold text-gray-400 block mb-1">Mật khẩu Admin</label>
        <input className="p-2 md:p-3 w-full bg-gray-700 rounded mb-4 outline-none text-sm md:text-base" placeholder="Nhập pass Host" type="password" value={hostPwd} onChange={e=>setHostPwd(e.target.value)} />
        
        {hostPwd === 'dev123' && (
          <div className="flex flex-col gap-3 animate-fade-in border-t border-gray-700 pt-4 text-xs md:text-sm">
            <label className="font-semibold text-gray-400 block -mb-2">Tên Phòng Đấu</label>
            <input className="p-2 md:p-3 bg-gray-700 rounded" value={localConfig.room_name} onChange={e=>setLocalConfig({...localConfig, room_name: e.target.value})} placeholder="Tên phòng" />
            <div className="flex gap-2 md:gap-4">
              <div className="flex-1"><label className="font-semibold text-gray-400 block mb-1">Ngang (W)</label><input type="number" className="p-2 md:p-3 bg-gray-700 rounded w-full" value={localConfig.map_width} onChange={e=>setLocalConfig({...localConfig, map_width: parseInt(e.target.value)})}/></div>
              <div className="flex-1"><label className="font-semibold text-gray-400 block mb-1">Dọc (H)</label><input type="number" className="p-2 md:p-3 bg-gray-700 rounded w-full" value={localConfig.map_height} onChange={e=>setLocalConfig({...localConfig, map_height: parseInt(e.target.value)})}/></div>
            </div>
            <div className="flex gap-2 md:gap-4">
              <div className="flex-1"><label className="font-semibold text-gray-400 block mb-1">Màu Bo</label><input type="color" className="p-1 bg-gray-700 rounded w-full h-10 md:h-12 cursor-pointer" value={localConfig.bg_color} onChange={e=>setLocalConfig({...localConfig, bg_color: e.target.value})} /></div>
              <div className="flex-1"><label className="font-semibold text-gray-400 block mb-1">MC</label><select className="p-2 md:p-3 bg-gray-700 rounded w-full h-10 md:h-12" value={localConfig.language} onChange={e=>setLocalConfig({...localConfig, language: e.target.value})}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></div>
            </div>
            <button onClick={saveConfig} className="bg-purple-600 hover:bg-purple-500 py-2 md:py-3 rounded font-bold mt-2">💾 LƯU SETTING</button>
            <div className="flex gap-2 mt-2">
              <button onClick={()=>fetch(`${API_URL}/bots`,{method:'POST'})} className="flex-1 bg-gray-600 hover:bg-gray-500 py-2 md:py-3 rounded font-bold">🤖 Nhét 10 Bots</button>
              <button onClick={()=>fetch(`${API_URL}/clear_players`,{method:'POST'})} className="flex-1 bg-red-900 hover:bg-red-800 py-2 md:py-3 rounded font-bold">🗑️ Xóa Tất Cả</button>
            </div>
            <button onClick={()=>fetch(`${API_URL}/phase/strategy`,{method:'POST'})} className="bg-red-600 hover:bg-red-500 py-3 rounded font-bold text-sm md:text-lg mt-2 animate-pulse">🔥 VÀO LẬP CHIẾN THUẬT</button>
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
    <div className="flex flex-col w-full items-center p-4 md:p-8 overflow-y-auto">
      <h2 className="text-2xl md:text-4xl font-bold mb-2 text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)] text-center">HỘI Ý CHIẾN THUẬT</h2>
      <div className="text-4xl md:text-6xl font-mono text-yellow-400 mb-6 drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]">{gameState.timer}s</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 w-full max-w-4xl text-sm md:text-base">
        <div className="bg-gray-800 p-6 md:p-8 rounded-xl border border-gray-700 shadow-2xl flex flex-col justify-between">
            <h3 className="text-lg md:text-xl font-bold mb-4 text-center text-blue-400">Thiết lập Não Bộ AI</h3>
            <form onSubmit={saveTactics} className="flex flex-col gap-2">
              <label className="text-xs md:text-sm font-semibold text-gray-400">Tên của bạn</label>
              <input className="p-3 mb-2 bg-gray-700 rounded outline-none border border-transparent" placeholder="Đã đăng ký" value={name} onChange={e=>setName(e.target.value)} />
              <label className="text-xs md:text-sm font-semibold text-gray-400">Mật khẩu cá nhân</label>
              <input className="p-3 mb-2 bg-gray-700 rounded outline-none border border-transparent" placeholder="Đã đăng ký" type="password" value={pwd} onChange={e=>setPwd(e.target.value)} />
              <label className="text-xs md:text-sm font-semibold text-gray-400 mt-2">1. Mục tiêu ưu tiên</label>
              <select className="p-3 mb-2 bg-gray-700 rounded cursor-pointer" value={targetRule} onChange={e=>setTargetRule(e.target.value)}>
                <option value="nearest">Người Gần Nhất (Cận chiến)</option><option value="lowest_hp">Bắt Nạt Kẻ Yếu (Móc lốp)</option><option value="tankiest">Thử Thách Độ Trâu (Lỳ lợm)</option><option value="counter">Gọt Mộc Tìm Khắc Hệ (IQ 200)</option>
              </select>
              <label className="text-xs md:text-sm font-semibold text-gray-400 mt-2">2. Chiến thuật Sinh tồn</label>
              <select className="p-3 mb-2 bg-gray-700 rounded cursor-pointer" value={campRule} onChange={e=>setCampRule(e.target.value)}>
                <option value="attack">Nhiệt Huyết Tuổi Trẻ (Va chạm)</option><option value="top5">Bảo Toàn Lực Lượng (Top 5)</option><option value="top3">Nằm Im Chờ Thời (Top 3)</option><option value="top2">Nhẫn Nhịn Tới Cùng (Top 2)</option>
              </select>
              <button className="bg-green-600 hover:bg-green-500 py-4 mt-6 rounded font-bold md:text-lg uppercase tracking-wider shadow-lg">LƯU CHỈ THỊ AI</button>
            </form>
        </div>
        <div className="bg-gray-800 p-6 md:p-8 rounded-xl border border-purple-500 shadow-2xl flex flex-col justify-center">
          <h3 className="text-lg md:text-xl font-bold mb-4 text-center text-purple-400">👑 Quyền Host</h3>
          <label className="text-xs md:text-sm font-semibold text-gray-400 block mb-1 text-center">Xác nhận Host để bỏ qua chờ</label>
          <input className="p-3 bg-gray-700 rounded mb-4 text-center outline-none" placeholder="Pass (dev123)" type="password" value={hostPwd} onChange={e=>setHostPwd(e.target.value)} />
          {hostPwd === 'dev123' && <button onClick={()=>fetch(`${API_URL}/phase/reveal`, {method: "POST"})} className="bg-red-600 hover:bg-red-500 py-4 rounded font-bold text-white uppercase animate-pulse shadow-lg text-sm md:text-base">⏩ Xem Bảng Phong Thần</button>}
        </div>
      </div>
    </div>
  );
}

function PhaseReveal({ gameState, hostPwd }) {
  const WEAPONS = gameState.config.weapons; const SHIELDS = gameState.config.shields;
  return (
    <div className="flex flex-col w-full h-full p-4 md:p-8 overflow-hidden bg-gray-900">
      <div className="flex flex-col md:flex-row justify-between items-center md:items-end mb-6 gap-4">
        <div className="text-center md:text-left"><h2 className="text-2xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-500 uppercase tracking-widest">Bảng Phong Thần</h2></div>
        <div className="flex items-center gap-4 md:gap-6">
          <div className="text-4xl md:text-5xl font-mono text-red-500 animate-pulse font-bold">{gameState.reveal_timer}s</div>
          {hostPwd === 'dev123' && <button onClick={()=>fetch(`${API_URL}/phase/playing`, {method: "POST"})} className="bg-purple-600 hover:bg-purple-500 py-2 px-3 md:px-4 rounded font-bold shadow-lg text-xs md:text-sm">⏩ BẮT ĐẦU VÀO ĐẤU</button>}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pb-10 custom-scrollbar pr-2">
        {Object.values(gameState.players).map((p, idx) => (
          <div key={idx} className="bg-gray-800 border-2 border-gray-700 p-3 md:p-4 rounded-xl shadow-lg flex flex-col gap-3 relative overflow-hidden group">
            <div className="flex justify-between items-center border-b border-gray-700 pb-2">
              <span className="font-bold text-base md:text-lg text-blue-300 truncate w-2/3">{p.name}</span>
              <span className="text-xl md:text-2xl drop-shadow-md whitespace-nowrap">{WEAPONS[p.weapon].e} {SHIELDS[p.shield].e}</span>
            </div>
            <div className="flex flex-col gap-2">
              <div className="bg-gray-900 p-2 rounded border border-gray-700"><span className="text-[10px] md:text-xs text-gray-500 block uppercase font-bold">🎯 Ưu Tiên</span><span className="text-sm md:text-base font-semibold text-gray-300">{TARGET_NAMES[p.target_rule]}</span></div>
              <div className="bg-gray-900 p-2 rounded border border-gray-700"><span className="text-[10px] md:text-xs text-gray-500 block uppercase font-bold">🏃 Hành Động</span><span className="text-sm md:text-base font-semibold text-gray-300">{CAMP_NAMES[p.camp_rule]}</span></div>
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
    <div className="flex flex-col lg:flex-row w-full h-full overflow-hidden min-h-0">
      <div className="flex-1 lg:flex-auto bg-[#0b0f19] relative flex items-center justify-center p-2 min-h-[50vh] lg:min-h-0 border-b lg:border-b-0 lg:border-r border-gray-700">
        <canvas ref={canvasRef} width={gameState.config.map_width} height={gameState.config.map_height} className="w-full h-full object-contain rounded shadow-[0_0_25px_rgba(0,0,0,0.8)]" />
      </div>
      <div className="w-full lg:w-96 h-[30vh] lg:h-full bg-gray-800 flex flex-col shrink-0 min-h-0">
        <div className="p-2 md:p-3 bg-gray-900 font-bold border-b border-gray-700 text-purple-400 flex items-center justify-between gap-2 shadow-md z-10">
          <span className="text-sm md:text-base">🎙️ Caster Panel</span>
          <button onClick={async () => { if(hostPwd==='dev123' || prompt("Pass:")==='dev123') await fetch(`${API_URL}/force_end`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({pwd:'dev123'})}); }} className="bg-red-600 hover:bg-red-500 text-white px-2 py-1 md:px-3 md:py-1 rounded text-[10px] md:text-xs uppercase shadow-md">🛑 Ngừng Trận</button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 md:p-4 space-y-2 flex flex-col-reverse custom-scrollbar">
          {gameState.logs.map((log, i) => (
            <div key={i} className={`p-2 rounded text-xs md:text-sm font-mono border-l-2 ${log.includes('💀') || log.includes('🛑') || log.includes('☠️') ? 'border-red-500 bg-red-900/20 text-red-200' : log.includes('💥') || log.includes('🎤') ? 'border-yellow-500 bg-yellow-900/20 text-yellow-200' : log.includes('🎁') || log.includes('💉') ? 'border-green-500 bg-green-900/20 text-green-200' : 'border-blue-500 bg-gray-700'}`}>
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
    <div className="flex w-full items-center justify-center flex-col min-h-0 overflow-y-auto p-4 md:p-8">
      <div className="bg-gray-800 p-6 md:p-12 rounded-2xl border-4 border-yellow-500 text-center shadow-[0_0_50px_rgba(234,179,8,0.5)] max-w-4xl w-full">
        <div className="text-6xl md:text-8xl mb-4 md:mb-6 animate-bounce">🏆</div>
        <h2 className="text-3xl md:text-5xl font-bold text-yellow-400 mb-2 uppercase">{winner ? winner.name : "HÒA NHAU"}</h2>
        <p className="text-sm md:text-xl text-gray-300 mb-6 md:mb-8 font-semibold">Đã xuất sắc giành ngôi vị Quán quân!</p>
        
        {winner && (
          <div className="bg-gray-900 p-4 md:p-6 rounded-xl border border-gray-700 shadow-inner flex flex-col md:flex-row gap-6 md:gap-8 text-left">
            <div className="flex-1 border-b md:border-b-0 md:border-r border-gray-700 pb-4 md:pb-0 md:pr-6">
                <h3 className="text-green-400 font-bold text-lg md:text-xl border-b border-gray-700 pb-2 mb-4">THÔNG SỐ BẢN THÂN</h3>
                <p className="text-sm md:text-lg mb-2">Trang bị: {WEAPONS[winner.weapon].e} + {SHIELDS[winner.shield].e}</p>
                <p className="text-sm md:text-lg mb-2">Máu còn lại: <strong className="text-green-400">{Math.floor(winner.hp)} / {winner.max_hp}</strong></p>
                <p className="text-sm md:text-lg mb-2">Mục tiêu: <strong className="text-yellow-400">{TARGET_NAMES[winner.target_rule]}</strong></p>
                <p className="text-sm md:text-lg">Sinh tồn: <strong className="text-yellow-400">{CAMP_NAMES[winner.camp_rule]}</strong></p>
            </div>
            <div className="flex-1">
                <h3 className="text-purple-400 font-bold text-lg md:text-xl border-b border-gray-700 pb-2 mb-4">THỐNG KÊ CHIẾN ĐẤU</h3>
                <div className="grid grid-cols-2 gap-3 md:gap-4 mb-4">
                    <div className="bg-gray-800 p-2 md:p-3 rounded border border-gray-700">
                        <span className="text-[10px] md:text-xs text-gray-400 block uppercase">Sát Thương Gây Ra</span>
                        <span className="text-base md:text-xl font-bold text-red-400">💥 {Math.floor(winner.damage_dealt)}</span>
                    </div>
                    <div className="bg-gray-800 p-2 md:p-3 rounded border border-gray-700">
                        <span className="text-[10px] md:text-xs text-gray-400 block uppercase">Đã Gánh Chịu</span>
                        <span className="text-base md:text-xl font-bold text-gray-300">🛡️ {Math.floor(winner.damage_taken)}</span>
                    </div>
                    <div className="bg-gray-800 p-2 md:p-3 rounded border border-gray-700">
                        <span className="text-[10px] md:text-xs text-gray-400 block uppercase">Nhặt Cứu Thương</span>
                        <span className="text-base md:text-xl font-bold text-green-400">💉 {winner.heals_looted} Hộp</span>
                    </div>
                    <div className="bg-gray-800 p-2 md:p-3 rounded border border-gray-700">
                        <span className="text-[10px] md:text-xs text-gray-400 block uppercase">Hạ Gục Đối Thủ</span>
                        <span className="text-base md:text-xl font-bold text-yellow-400">🩸 {winner.kills} Ng</span>
                    </div>
                </div>
                <div className="bg-gray-800 p-2 md:p-3 rounded border border-gray-700">
                    <span className="text-[10px] md:text-xs text-gray-400 block uppercase mb-1">Danh sách Nạn Nhân:</span>
                    <span className="text-xs md:text-sm font-semibold text-gray-200">
                        {winner.killed_names && winner.killed_names.length > 0 ? winner.killed_names.join(', ') : 'Rất hiền lành, chưa đánh bại ai!'}
                    </span>
                </div>
            </div>
          </div>
        )}
      </div>
      <button onClick={()=>fetch(`${API_URL}/phase/waiting`,{method:'POST'})} className="mt-6 md:mt-8 bg-gray-700 hover:bg-gray-600 px-6 md:px-10 py-3 md:py-4 rounded-full font-bold text-sm md:text-xl transition-transform hover:scale-105">TRỞ VỀ LOBBY</button>
    </div>
  );
}