import React, { useState, useEffect, useRef } from 'react';

const isLocal = window.location.hostname === 'localhost';
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const host = window.location.host;
const API_URL = isLocal ? "http://localhost:8000/api" : `/api`;
const getWsUrl = (roomId) => isLocal ? `ws://localhost:8000/ws/${roomId}` : `${protocol}//${host}/ws/${roomId}`;

let availableVoices = [];
const loadVoices = () => { if (window.speechSynthesis) availableVoices = window.speechSynthesis.getVoices(); };
if (window.speechSynthesis) { loadVoices(); window.speechSynthesis.onvoiceschanged = loadVoices; }

const getVietnameseVoice = () => {
  if (!availableVoices.length) loadVoices();
  let v = availableVoices.find(voice => (voice.name.includes("An") || voice.name.includes("HoaiMy")) && voice.lang.includes("vi"));
  if (v) return v;
  v = availableVoices.find(voice => voice.name === "Google Tiếng Việt");
  return v || availableVoices.find(voice => voice.lang.includes('vi') || voice.name.toLowerCase().includes('vietnamese'));
};

// ==========================================
// 1. SOUND ENGINE MỚI (DÙNG FILE MP3 THẬT)
// ==========================================
class SoundEngine {
  constructor() { 
    this.muted = false; 
    
    // Tải sẵn các file MP3 từ thư mục public/sounds/
    this.sounds = {
      sword: new Audio('/sounds/sword.mp3'),
      spear: new Audio('/sounds/spear.mp3'),
      dagger: new Audio('/sounds/dagger.mp3'),
      bow: new Audio('/sounds/bow.mp3'),
      hammer: new Audio('/sounds/hammer.mp3'),
      dodge: new Audio('/sounds/dodge.mp3'),
      heal: new Audio('/sounds/heal.mp3'),
      death: new Audio('/sounds/death.mp3'),
      win: new Audio('/sounds/win.mp3')
    };
  }
  
  init() {
    // Mở khóa audio trên Mobile: Phát tất cả với volume = 0
    Object.values(this.sounds).forEach(audio => {
        audio.volume = 0; 
        let playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.then(() => { 
                audio.pause(); 
                audio.currentTime = 0; 
                audio.volume = 1; // Trả lại volume
            }).catch(e => console.warn("Chưa unlock được audio:", e));
        }
    });
  }
  
  play(type, weapon = null) {
    if (this.muted) return;
    
    let targetSound;
    if (type === 'attack' && weapon && this.sounds[weapon]) {
        targetSound = this.sounds[weapon];
    } else if (this.sounds[type]) {
        targetSound = this.sounds[type];
    }

    if (targetSound) {
        targetSound.currentTime = 0; // Tua lại đầu để phát liên tục
        targetSound.volume = (type === 'death' || type === 'hammer') ? 0.9 : 0.6;
        targetSound.play().catch(e => console.warn("Trình duyệt chặn audio:", e));
    }
  }
}
const sfx = new SoundEngine();

// ==========================================
// 2. VOICE ENGINE (ĐÃ FIX LỖI UNLOCK)
// ==========================================
class VoiceEngine {
  constructor() { 
    this.synth = window.speechSynthesis; 
    this.muted = false; 
    this.unlocked = false; // Thêm cờ để chỉ lừa trình duyệt 1 lần
  }
  init() {
      if (this.synth && !this.unlocked) {
          let dummy = new SpeechSynthesisUtterance(' ');
          dummy.volume = 0; 
          this.synth.speak(dummy);
          this.unlocked = true;
      }
  }
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

// ==========================================
// 3. HÀM ĐỌC LOG (ĐÃ FIX LỖI ECHO 5 TAB)
// ==========================================
const speakLog = (text, langStr, muted) => {
  // Thêm document.hidden: Chỉ tab nào đang hiển thị trên màn hình mới được đọc
  if (muted || !window.speechSynthesis || document.hidden) return;
  
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

const getDynamicColors = (weapon, isOutsideZone) => {
  if (isOutsideZone) {
      return { fill: `rgba(255, 255, 255, 0.1)`, stroke: `rgba(255, 255, 255, 0.3)`, slash: `255, 255, 255` };
  } else {
      return { fill: `rgba(0, 0, 0, 0.08)`, stroke: `rgba(0, 0, 0, 0.3)`, slash: `220, 38, 38` };
  }
};

const TARGET_NAMES = { nearest: "Người Gần Nhất", lowest_hp: "Bắt Nạt Kẻ Yếu", tankiest: "Thử Thách Độ Trâu", counter: "Tìm Khắc Hệ" };
const CAMP_NAMES = { attack: "Nhiệt Huyết", top5: "Bảo Toàn (Top 5)", top3: "Chờ Thời (Top 3)", top2: "Nhẫn Nhịn" };
const AVATARS = ["🐘", "🐕", "🐈", "🐔", "🐢", "🐧", "🦖", "🐒", "🐯", "🐻", "👽", "👻", "🤡", "🤖"];
const COLORS = ["#1e293b", "#7f1d1d", "#14532d", "#1e3a8a", "#581c87", "#9f1239", "#b45309", "#064e3b", "#0f766e"];

export default function App() {
  const [roomId, setRoomId] = useState('');
  const [inRoom, setInRoom] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [muted, setMuted] = useState(false);
  
  const [globalHostPwd, setGlobalHostPwd] = useState('');
  const spokenLogs = useRef(new Set());
  const prevPhase = useRef('');
  const wsRef = useRef(null);
  const mutedRef = useRef(muted);

  useEffect(() => {
      mutedRef.current = muted;
      sfx.muted = muted; 
      humanVoice.muted = muted;
  }, [muted]);

  useEffect(() => {
    if (!inRoom || !roomId) return;
    sfx.init(); humanVoice.init();

    wsRef.current = new WebSocket(getWsUrl(roomId));
    wsRef.current.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setGameState(data);
      
      if (data.phase === 'reveal' && prevPhase.current !== 'reveal') humanVoice.shout('reveal');
      if (data.phase === 'finished' && prevPhase.current === 'playing') if (window.speechSynthesis) window.speechSynthesis.cancel();
      prevPhase.current = data.phase;
      
      if(data.events) {
        data.events.forEach(ev => {
          if(ev.type === 'attack') sfx.play('attack', ev.weapon);
          if(ev.type === 'dodge') sfx.play('dodge'); 
          if(ev.type === 'heal') sfx.play('heal');
          if(ev.type === 'death') sfx.play('death');
          if(ev.type === 'win') sfx.play('win');
        });
      }

      if(data.logs.length > 0) {
        const topLog = data.logs[0];
        if(!spokenLogs.current.has(topLog)) {
          spokenLogs.current.add(topLog);
          if(topLog.includes("💀") || topLog.includes("🏆") || topLog.includes("🎤") || topLog.includes("💥") || topLog.includes("☠️") || topLog.includes("💉") || topLog.includes("🎁") || topLog.includes("🔥") || topLog.includes("⚠️") || topLog.includes("🛑")) {
            speakLog(topLog, data.config.language, mutedRef.current);
          }
        }
      }
    };

    return () => { if(wsRef.current) wsRef.current.close(); };
  }, [inRoom, roomId]); 

  if (!inRoom) {
      return <HomeScreen setRoomId={setRoomId} setInRoom={setInRoom} setGlobalHostPwd={setGlobalHostPwd} />
  }

  if (!gameState) return <div className="flex h-screen items-center justify-center text-sm md:text-xl text-white bg-gray-950">Đang kết nối vào phòng {roomId}...</div>;

  const aliveCount = Object.values(gameState.players || {}).filter(p=>p.alive).length;
  const zoneRadius = Math.floor(gameState.zone?.r || 0);
  const isPlaying = gameState.phase === 'playing';

  return (
    <div className={`w-full bg-gray-950 text-white flex flex-col ${gameState.phase === 'playing' ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      <header className="shrink-0 bg-gray-900 p-2 md:p-3 shadow-md flex justify-between items-center z-10 relative border-b border-gray-800">
        <div className="flex-1 w-1/3 flex items-center gap-2">
            <button onClick={() => { setInRoom(false); setGameState(null); if(wsRef.current) wsRef.current.close(); }} className="bg-gray-700 text-white px-2 py-1 rounded text-xs hover:bg-gray-600 font-bold transition-colors">🏠 Thoát</button>
            <h1 className="text-sm md:text-xl font-black text-yellow-400 truncate">{gameState.config.room_name}</h1>
        </div>
        {isPlaying && (
            <div className="flex-1 flex justify-center w-1/3">
                <div className="flex gap-2 md:gap-6 bg-gray-800 px-3 md:px-5 py-1.5 rounded-full border border-gray-700 font-mono text-[10px] md:text-base font-bold shadow-inner">
                    <div className="truncate"><span className="text-green-400">{aliveCount} Sống</span></div>
                    <div className="w-px bg-gray-600"></div>
                    <div className="truncate">Bo: <span className="text-red-400">{zoneRadius}</span></div>
                </div>
            </div>
        )}
        <div className="flex-1 flex justify-end w-1/3">
            <button onClick={() => setMuted(!muted)} className={`p-1.5 md:p-2 rounded text-[10px] md:text-sm font-bold text-white ${muted ? 'bg-red-600' : 'bg-green-600'} transition-colors`}>
            {muted ? "🔇 TẮT ÂM" : "🔊 BẬT ÂM"}
            </button>
        </div>
      </header>

      <main className={`flex-1 w-full flex flex-col ${gameState.phase === 'playing' ? 'min-h-0 overflow-hidden' : ''}`}>
        {gameState.phase === 'waiting' && <Phase1 roomId={roomId} gameState={gameState} hostPwd={globalHostPwd} setHostPwd={setGlobalHostPwd} />}
        {gameState.phase === 'strategy' && <Phase2 roomId={roomId} gameState={gameState} hostPwd={globalHostPwd} setHostPwd={setGlobalHostPwd} />}
        {gameState.phase === 'reveal' && <PhaseReveal roomId={roomId} gameState={gameState} hostPwd={globalHostPwd} />}
        {gameState.phase === 'playing' && <Phase3 roomId={roomId} gameState={gameState} hostPwd={globalHostPwd} />}
        {gameState.phase === 'finished' && <PhaseFinished roomId={roomId} gameState={gameState} />}
      </main>
    </div>
  );
}

function HomeScreen({ setRoomId, setInRoom, setGlobalHostPwd }) {
    const [joinId, setJoinId] = useState('');
    const [createId, setCreateId] = useState('');
    const [hostPwd, setHostPwd] = useState('');

    const handleJoin = async (e) => {
        e.preventDefault();
        // Cú lừa trình duyệt: Unlock âm thanh ngay tại đây
        sfx.init(); humanVoice.init(); 

        if(!joinId) return alert("Nhập mã phòng!");
        const res = await fetch(`${API_URL}/check_room/${joinId}`);
        const d = await res.json();
        if (d.error) return alert(d.error);
        setRoomId(joinId.toUpperCase());
        setInRoom(true);
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        sfx.init(); humanVoice.init();

        if(!createId || !hostPwd) return alert("Nhập mã phòng và Pass Host!");
        const res = await fetch(`${API_URL}/create_room`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({room_id: createId, host_pwd: hostPwd})
        });
        const d = await res.json();
        if (d.error) return alert(d.error);
        setGlobalHostPwd(hostPwd);
        setRoomId(d.room_id);
        setInRoom(true);
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white p-4 md:p-8">
          <div className="max-w-7xl w-full bg-gray-900 border border-gray-800 rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.8)] p-6 md:p-10 flex flex-col lg:flex-row gap-8 md:gap-12 relative overflow-hidden">
            
            <div className="w-full lg:w-7/12 flex flex-col items-center lg:items-start z-10">
                <div className="mb-6 md:mb-8 text-center flex flex-col items-center lg:items-start w-full">
                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-black mb-1 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-500 uppercase tracking-widest drop-shadow-md">
                      SURVIVAL BATTLE
                    </h1>
                    <h2 className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-300 tracking-[0.2em] border-b border-gray-700 pb-4 mb-2 uppercase">
                      TRẬN CHIẾN SINH TỒN
                    </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs md:text-sm h-full content-start w-full">
                  <div className="bg-gray-800/80 p-5 rounded-2xl border-l-4 border-blue-500 shadow-inner">
                    <h3 className="font-bold text-blue-400 mb-2 text-base uppercase">🤖 Tự Động Chiến Đấu</h3>
                    <p className="text-gray-300 leading-relaxed text-justify">
                      Bạn chỉ cần <b>Đăng ký</b> trang bị và <b>Cài đặt não bộ AI</b>. Trận đấu bắt đầu, AI sẽ tự động xử lý nhau không cần thao tác tay.
                    </p>
                  </div>
                  <div className="bg-gray-800/80 p-5 rounded-2xl border-l-4 border-red-500 shadow-inner">
                    <h3 className="font-bold text-red-400 mb-2 text-base uppercase">⚔️ Khắc Hệ Nhân Phẩm</h3>
                    <p className="text-gray-300 leading-relaxed text-justify">
                      Vũ khí khắc chế khiên sẽ <b>x2 sát thương</b>. Có cả <b>Chí mạng</b> và <b>Né đòn</b>. Mang đồ nặng thì chạy bo cực chậm.
                    </p>
                  </div>
                  <div className="bg-gray-800/80 p-5 rounded-2xl border-l-4 border-green-500 shadow-inner">
                    <h3 className="font-bold text-green-400 mb-2 text-base uppercase">🏃 Sinh Tồn Vòng Bo</h3>
                    <p className="text-gray-300 leading-relaxed text-justify">
                      Bo thu hẹp liên tục! Hãy núp <b>Bụi Cỏ</b> tàng hình, hoặc liều mạng nhặt <b>Airdrop (Thính)</b> để hồi máu đầy bình.
                    </p>
                  </div>
                  <div className="bg-gray-800/80 p-5 rounded-2xl border-l-4 border-yellow-500 shadow-inner">
                    <h3 className="font-bold text-yellow-400 mb-2 text-base uppercase">🎙️ Caster AI Tấu Hài</h3>
                    <p className="text-gray-300 leading-relaxed text-justify">
                      Sự hèn nhát núp lùm hay kỹ năng gánh team của bạn sẽ bị <b>Bình Luận Viên</b> bóc phốt và tấu hài trực tiếp bằng giọng nói.
                    </p>
                  </div>
                </div>
            </div>

            <div className="w-full lg:w-5/12 flex flex-col gap-6 z-10 bg-gray-950/50 p-6 md:p-8 rounded-3xl border border-gray-800 justify-center shadow-inner">
                <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-lg">
                    <h2 className="text-xl font-black text-green-400 mb-4 flex items-center gap-2"><span>🎯</span> VÀO PHÒNG SẴN CÓ</h2>
                    <form onSubmit={handleJoin} className="flex flex-col gap-4">
                        <input className="p-3 bg-gray-700 border border-gray-600 rounded-xl outline-none text-xl uppercase font-bold text-center focus:border-green-500 transition-colors" placeholder="MÃ PHÒNG (VD: P123)" value={joinId} onChange={e=>setJoinId(e.target.value)} />
                        <button className="bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-bold text-xl shadow-md transition-transform hover:scale-[1.02]">🚀 VÀO NGAY</button>
                    </form>
                </div>
                
                <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-lg">
                    <h2 className="text-xl font-black text-purple-400 mb-4 flex items-center gap-2"><span>👑</span> TẠO PHÒNG MỚI</h2>
                    <form onSubmit={handleCreate} className="flex flex-col gap-4">
                        <input className="p-3 bg-gray-700 border border-gray-600 rounded-xl outline-none uppercase font-bold text-center focus:border-purple-500 transition-colors" placeholder="MÃ PHÒNG MỚI TỰ ĐẶT" value={createId} onChange={e=>setCreateId(e.target.value)} />
                        <input className="p-3 bg-gray-700 border border-gray-600 rounded-xl outline-none text-center focus:border-purple-500 transition-colors" placeholder="MẬT KHẨU HOST (QUẢN LÝ)" type="password" value={hostPwd} onChange={e=>setHostPwd(e.target.value)} />
                        <button className="bg-purple-600 hover:bg-purple-500 text-white py-3 rounded-xl font-bold text-xl shadow-md transition-transform hover:scale-[1.02]">TẠO PHÒNG</button>
                    </form>
                </div>
            </div>

          </div>
        </div>
    );
}

function Phase1({ roomId, gameState, hostPwd, setHostPwd }) {
  const[name, setName] = useState(''); const[pwd, setPwd] = useState('');
  const[weapon, setWeapon] = useState('sword'); const[shield, setShield] = useState('wood_shield');
  const[avatar, setAvatar] = useState(AVATARS[0]); const[color, setColor] = useState(COLORS[0]);
  const[localConfig, setLocalConfig] = useState(gameState.config);
  
  const WEAPONS = gameState.config.weapons; const SHIELDS = gameState.config.shields;

  const handleRegister = async (e) => {
    e.preventDefault(); if (!name || !pwd) return alert("Nhập tên và mật khẩu!");
    const res = await fetch(`${API_URL}/${roomId}/register`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ name, pwd, weapon, shield, avatar, color }) });
    const d = await res.json(); if(d.error) alert(d.error); else alert("Đăng ký thành công!");
  };

  const saveConfig = async () => {
    await fetch(`${API_URL}/${roomId}/config`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(localConfig) });
    alert("Đã lưu cấu hình lên Server!");
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-y-auto">
      <div className="bg-gray-800 p-4 md:p-6 rounded-2xl border border-gray-700 shadow-xl h-fit">
        <h2 className="text-lg md:text-xl font-black mb-4 text-blue-400">1. Tạo Thẻ Nhân Vật</h2>
        <form onSubmit={handleRegister} className="flex flex-col gap-1 text-sm md:text-base">
          <input className="p-2 md:p-3 mb-2 bg-gray-700 border border-gray-600 rounded outline-none focus:border-blue-500" placeholder="Tên hiển thị (Ingame)" value={name} onChange={e=>setName(e.target.value)} />
          <input className="p-2 md:p-3 mb-2 bg-gray-700 border border-gray-600 rounded outline-none focus:border-blue-500" placeholder="Mật khẩu cá nhân" type="password" value={pwd} onChange={e=>setPwd(e.target.value)} />
          
          <label className="text-xs md:text-sm font-bold text-gray-400 mt-2">Chọn Linh vật (Avatar)</label>
          <div className="flex flex-wrap gap-2 mb-2 bg-gray-900 p-2 rounded">
              {AVATARS.map(a => <button type="button" key={a} onClick={()=>setAvatar(a)} className={`text-2xl p-1 rounded transition-colors ${avatar===a?'bg-blue-600 shadow-md':''}`}>{a}</button>)}
          </div>

          <label className="text-xs md:text-sm font-bold text-gray-400 mt-2">Màu nền thẻ (Background)</label>
          <div className="flex flex-wrap gap-2 mb-2 bg-gray-900 p-2 rounded">
              {COLORS.map(c => <button type="button" key={c} onClick={()=>setColor(c)} style={{backgroundColor: c}} className={`w-8 h-8 rounded-full border-2 transition-all ${color===c?'border-white scale-110 shadow-md':'border-transparent'}`}></button>)}
          </div>
          
          <label className="text-xs md:text-sm font-bold text-gray-400 mt-2 flex justify-between items-center">
            <span>Chọn Vũ Khí & Khiên</span>
            <span className="text-[10px] md:text-xs text-green-400 animate-pulse">🔊 Bấm nghe thử</span>
          </label>
          <div className="flex gap-2 mb-2">
            <select className="p-2 md:p-3 bg-gray-700 border border-gray-600 rounded flex-1 outline-none cursor-pointer" value={weapon} onChange={(e)=>{setWeapon(e.target.value); sfx.play('attack', e.target.value);}}>
                {Object.entries(WEAPONS).map(([k,v]) => <option key={k} value={k}>{v.e} {v.n}</option>)}
            </select>
            <select className="p-2 md:p-3 bg-gray-700 border border-gray-600 rounded flex-1 outline-none cursor-pointer" value={shield} onChange={e=>setShield(e.target.value)}>
                {Object.entries(SHIELDS).map(([k,v]) => <option key={k} value={k}>{v.e} {v.n}</option>)}
            </select>
          </div>
          <button className="bg-blue-600 hover:bg-blue-500 text-white py-3 mt-4 rounded-xl font-bold shadow-lg transition-transform hover:scale-[1.02]">GHI DANH VÀO PHÒNG</button>
        </form>
        
        <div className="mt-6 md:mt-8 border-t border-gray-700 pt-4">
          <h3 className="font-bold text-green-400 mb-2 text-sm md:text-base">Người trong phòng ({Object.keys(gameState.players).length}):</h3>
          <div className="flex flex-wrap gap-2">
            {Object.values(gameState.players).map(p => <span key={p.name} className="px-2 py-1 rounded text-xs md:text-sm shadow-sm font-bold text-white border border-gray-700" style={{backgroundColor: p.color}}>{p.avatar} {p.name}</span>)}
          </div>
        </div>
      </div>

      <div className="bg-gray-800 p-4 md:p-6 rounded-2xl border border-gray-700 h-[400px] md:h-[750px] overflow-y-auto custom-scrollbar shadow-xl">
        <h2 className="text-xl md:text-2xl font-black mb-4 text-yellow-400 border-b border-gray-700 pb-2">📖 Bí Kíp Sinh Tồn</h2>
        <div className="text-xs md:text-sm space-y-6 text-gray-300">
            <div className="bg-red-900/20 border border-red-800/50 p-3 rounded-xl">
                <h3 className="text-red-400 font-bold mb-2 text-base uppercase">⚔️ Khắc Hệ (Đam x2)</h3>
                <div className="space-y-3 bg-black/40 p-3 rounded-lg border border-gray-700 italic text-gray-400">
                    <p><b>Khắc hệ:</b> Kiếm chém Gỗ 👉 Đam x2.</p>
                    <p><b>Bị khắc:</b> Cung bắn Thép 👉 Mũi tên gãy, đam giảm 50%.</p>
                </div>
            </div>
            <div>
                <h3 className="text-yellow-400 font-bold mb-3 text-base uppercase border-b border-gray-700 pb-1">🔫 Vũ Khí</h3>
                <div className="grid gap-3">
                    {Object.entries(WEAPONS).map(([k, v]) => (
                        <div key={k} className="bg-gray-700 p-3 rounded-xl flex flex-col gap-1 border border-gray-600">
                            <span className="font-black text-white text-base">{v.e} {v.n}</span>
                            <div className="grid grid-cols-2 text-gray-300 text-[11px] md:text-xs">
                                <span>💥 Đam: <span className="font-bold text-white">{v.dmg}</span></span>
                                <span>⏱️ Tốc: <span className="font-bold text-white">{(v.cd_ticks * 0.1).toFixed(1)}s</span></span>
                                <span>⚖️ Nặng: <span className="font-bold text-white">{v.weight}</span></span>
                                <span className="text-yellow-400">⚡ Crit: {Math.round(v.crit * 100)}%</span>
                                <span className="text-red-400 col-span-2">⚔️ Khắc: {Array.isArray(v.counters) ? v.counters.map(c => SHIELDS[c]?.n).join(', ') : SHIELDS[v.counters]?.n}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      </div>

      <div className="bg-gray-800 p-4 md:p-6 rounded-2xl border border-gray-700 h-fit shadow-xl">
        <h2 className="text-lg md:text-xl font-black mb-4 text-purple-400">👑 Host</h2>
        <input className="p-2 md:p-3 w-full bg-gray-700 border border-gray-600 rounded mb-4 outline-none text-sm md:text-base focus:border-purple-500" placeholder="Nhập pass Host của phòng" type="password" value={hostPwd} onChange={e=>setHostPwd(e.target.value)} />
        
        {hostPwd === gameState.host_pwd && (
          <div className="flex flex-col gap-3 border-t border-gray-700 pt-4 text-xs md:text-sm">
            <label className="font-bold text-gray-400 block -mb-2">Tên Phòng Đấu</label>
            <input className="p-2 md:p-3 bg-gray-700 border border-gray-600 rounded outline-none focus:border-purple-500" value={localConfig.room_name} onChange={e=>setLocalConfig({...localConfig, room_name: e.target.value})} placeholder="Tên phòng" />
            
            <div className="flex gap-2 md:gap-4 mt-1">
              <div className="flex-1">
                 <label className="font-bold text-gray-400 block mb-1">Ngang (W)</label>
                 <input type="number" className="p-2 md:p-3 bg-gray-700 border border-gray-600 rounded w-full outline-none focus:border-purple-500" value={localConfig.map_width} onChange={e=>setLocalConfig({...localConfig, map_width: parseInt(e.target.value)})}/>
              </div>
              <div className="flex-1">
                 <label className="font-bold text-gray-400 block mb-1">Dọc (H)</label>
                 <input type="number" className="p-2 md:p-3 bg-gray-700 border border-gray-600 rounded w-full outline-none focus:border-purple-500" value={localConfig.map_height} onChange={e=>setLocalConfig({...localConfig, map_height: parseInt(e.target.value)})}/>
              </div>
            </div>
            
            <div className="flex gap-2 md:gap-4 mt-1">
              <div className="flex-1">
                 <label className="font-bold text-gray-400 block mb-1">Sàn Đấu</label>
                 <div className="flex gap-3 h-10 md:h-12 items-center bg-gray-700 border border-gray-600 rounded px-3">
                    <button type="button" onClick={()=>setLocalConfig({...localConfig, bg_color: '#84cc16'})} className={`w-6 h-6 md:w-8 md:h-8 rounded-full border-2 transition-all ${localConfig.bg_color==='#84cc16'?'border-white scale-110 shadow-md':'border-transparent'}`} style={{backgroundColor: '#84cc16'}} title="Xanh Cỏ"></button>
                    <button type="button" onClick={()=>setLocalConfig({...localConfig, bg_color: '#fcd34d'})} className={`w-6 h-6 md:w-8 md:h-8 rounded-full border-2 transition-all ${localConfig.bg_color==='#fcd34d'?'border-white scale-110 shadow-md':'border-transparent'}`} style={{backgroundColor: '#fcd34d'}} title="Vàng Cát"></button>
                 </div>
              </div>
              <div className="flex-1">
                 <label className="font-bold text-gray-400 block mb-1">MC Ngôn ngữ</label>
                 <select className="p-2 md:p-3 bg-gray-700 border border-gray-600 rounded w-full h-10 md:h-12 outline-none focus:border-purple-500" value={localConfig.language} onChange={e=>setLocalConfig({...localConfig, language: e.target.value})}>
                    <option value="vi">Tiếng Việt</option>
                    <option value="en">English</option>
                 </select>
              </div>
            </div>
            
            <button onClick={saveConfig} className="bg-purple-600 hover:bg-purple-500 text-white py-2 md:py-3 rounded-xl font-bold mt-2 shadow-lg transition-transform hover:scale-[1.02]">💾 LƯU SETTING</button>
            <div className="flex gap-2 mt-2">
              <button onClick={()=>fetch(`${API_URL}/${roomId}/bots`,{method:'POST'})} className="flex-1 bg-gray-700 hover:bg-gray-600 border border-gray-600 text-white py-2 md:py-3 rounded-xl font-bold transition-colors">🤖 Thêm Bots</button>
              <button onClick={()=>fetch(`${API_URL}/${roomId}/clear_players`,{method:'POST'})} className="flex-1 bg-red-900 hover:bg-red-800 border border-red-700 text-white py-2 md:py-3 rounded-xl font-bold transition-colors">🗑️ Xóa</button>
            </div>
            <button onClick={()=>fetch(`${API_URL}/${roomId}/phase/strategy`,{method:'POST'})} className="bg-orange-600 hover:bg-orange-500 text-white py-3 rounded-xl font-black text-sm md:text-lg mt-2 animate-pulse shadow-lg">🔥 VÀO LẬP CHIẾN THUẬT</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Phase2({ roomId, gameState, hostPwd, setHostPwd }) {
  const [name, setName] = useState(''); const[pwd, setPwd] = useState('');
  const[targetRule, setTargetRule] = useState('nearest'); const[campRule, setCampRule] = useState('attack');

  const saveTactics = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API_URL}/${roomId}/strategy`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ name, pwd, target_rule: targetRule, camp_rule: campRule }) });
    const d = await res.json(); if(d.error) alert(d.error); else alert("Cài AI thành công!");
  };

  return (
    <div className="flex flex-col w-full items-center p-4 md:p-8 overflow-y-auto">
      <h2 className="text-2xl md:text-4xl font-black mb-2 text-red-500 text-center drop-shadow-md">HỘI Ý CHIẾN THUẬT</h2>
      <div className="text-4xl md:text-6xl font-mono text-yellow-400 mb-6 font-bold drop-shadow-md">{gameState.timer}s</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 w-full max-w-4xl text-sm md:text-base">
        <div className="bg-gray-800 p-6 md:p-8 rounded-2xl border border-gray-700 shadow-xl flex flex-col justify-between">
            <h3 className="text-lg md:text-xl font-black mb-4 text-center text-blue-400">Thiết lập Không Gian Não Bộ</h3>
            <form onSubmit={saveTactics} className="flex flex-col gap-2">
              <input className="p-3 mb-2 bg-gray-700 border border-gray-600 rounded outline-none focus:border-blue-500" placeholder="Tên đã đăng ký" value={name} onChange={e=>setName(e.target.value)} />
              <input className="p-3 mb-2 bg-gray-700 border border-gray-600 rounded outline-none focus:border-blue-500" placeholder="Pass đã đăng ký" type="password" value={pwd} onChange={e=>setPwd(e.target.value)} />
              <select className="p-3 mb-2 bg-gray-700 border border-gray-600 rounded cursor-pointer outline-none" value={targetRule} onChange={e=>setTargetRule(e.target.value)}>
                <option value="nearest">Người Gần Nhất</option><option value="lowest_hp">Bắt Nạt Kẻ Yếu</option><option value="tankiest">Thử Thách Độ Trâu</option><option value="counter">Tìm Khắc Hệ (IQ 200)</option>
              </select>
              <select className="p-3 mb-2 bg-gray-700 border border-gray-600 rounded cursor-pointer outline-none" value={campRule} onChange={e=>setCampRule(e.target.value)}>
                <option value="attack">Nhiệt Huyết (Va chạm)</option><option value="top5">Bảo Toàn (Top 5)</option><option value="top3">Chờ Thời (Top 3)</option><option value="top2">Nhẫn Nhịn (Top 2)</option>
              </select>
              <button className="bg-green-600 hover:bg-green-500 text-white py-4 mt-6 rounded-xl font-bold shadow-lg transition-transform hover:scale-[1.02]">LƯU CHỈ THỊ AI</button>
            </form>
        </div>
        <div className="bg-gray-800 p-6 md:p-8 rounded-2xl border border-purple-900 shadow-xl flex flex-col justify-center">
          <h3 className="text-lg md:text-xl font-black mb-4 text-center text-purple-400">👑 Host</h3>
          <input className="p-3 bg-gray-700 border border-gray-600 rounded mb-4 text-center outline-none focus:border-purple-500" placeholder="Pass Host" type="password" value={hostPwd} onChange={e=>setHostPwd(e.target.value)} />
          {hostPwd === gameState.host_pwd && <button onClick={()=>fetch(`${API_URL}/${roomId}/phase/reveal`, {method: "POST"})} className="bg-red-600 hover:bg-red-500 text-white py-4 rounded-xl font-bold uppercase animate-pulse shadow-lg transition-transform hover:scale-[1.02]">⏩ Bảng Phong Thần</button>}
        </div>
      </div>
    </div>
  );
}

function PhaseReveal({ roomId, gameState, hostPwd }) {
  const WEAPONS = gameState.config.weapons; const SHIELDS = gameState.config.shields;
  return (
    <div className="flex flex-col w-full h-full p-4 md:p-8 overflow-hidden bg-gray-950">
      <div className="flex flex-col md:flex-row justify-between items-center md:items-end mb-6 gap-4">
        <h2 className="text-2xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-500 uppercase tracking-widest">Bảng Phong Thần</h2>
        <div className="flex items-center gap-4 md:gap-6">
          <div className="text-4xl md:text-5xl font-mono text-red-500 animate-pulse font-bold">{gameState.reveal_timer}s</div>
          {hostPwd === gameState.host_pwd && <button onClick={()=>fetch(`${API_URL}/${roomId}/phase/playing`, {method: "POST"})} className="bg-purple-600 hover:bg-purple-500 text-white py-2 px-3 md:px-4 rounded-xl font-bold shadow-lg text-xs md:text-sm">⏩ BẮT ĐẦU VÀO ĐẤU</button>}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pb-10 custom-scrollbar pr-2">
        {Object.values(gameState.players).map((p, idx) => (
          <div key={idx} className="p-3 rounded-2xl shadow-lg border border-gray-700 flex flex-col gap-2 relative transition-transform hover:scale-[1.02]" style={{backgroundColor: p.color}}>
            <div className="flex justify-between items-center border-b border-white/20 pb-2">
              <span className="font-bold text-lg text-white truncate"><span className="text-2xl mr-2">{p.avatar}</span>{p.name}</span>
              <span className="text-xl drop-shadow-md">{WEAPONS[p.weapon].e}{SHIELDS[p.shield].e}</span>
            </div>
            <div className="bg-black/30 p-2 rounded"><span className="text-[10px] text-white/70 uppercase">🎯 Ưu Tiên:</span> <span className="text-sm font-semibold text-white">{TARGET_NAMES[p.target_rule]}</span></div>
            <div className="bg-black/30 p-2 rounded"><span className="text-[10px] text-white/70 uppercase">🏃 Hành Động:</span> <span className="text-sm font-semibold text-white">{CAMP_NAMES[p.camp_rule]}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Phase3({ roomId, gameState, hostPwd }) {
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
    
    // Ngoài bo: Đại Dương Đêm
    ctx.fillStyle = '#0f172a'; 
    ctx.fillRect(0, 0, cw, ch);
    
    // Sàn đấu (Cỏ hoặc Cát do Host chọn)
    ctx.beginPath(); ctx.arc(z.x, z.y, Math.max(0, z.r), 0, Math.PI * 2);
    ctx.fillStyle = gameState.config.bg_color; ctx.shadowBlur = 0; ctx.fill(); 

    // Vẽ Viền Đỏ của Vòng Bo
    ctx.beginPath(); ctx.arc(z.x, z.y, Math.max(0, z.r), 0, Math.PI * 2); 
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 6; ctx.stroke();

    if(gameState.bushes) gameState.bushes.forEach(b => { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(21, 128, 61, 0.7)'; ctx.fill(); ctx.strokeStyle = 'rgba(20, 83, 45, 0.9)'; ctx.lineWidth = 4; ctx.setLineDash([15, 20]); ctx.stroke(); ctx.setLineDash([]); });
    if(gameState.airdrops) gameState.airdrops.forEach(drop => { ctx.fillStyle = '#b45309'; ctx.fillRect(drop.x - 15, drop.y - 15, 30, 30); ctx.fillStyle = '#ef4444'; ctx.fillRect(drop.x - 4, drop.y - 10, 8, 20); ctx.fillRect(drop.x - 10, drop.y - 4, 20, 8); ctx.strokeStyle = '#facc15'; ctx.shadowBlur = 15; ctx.shadowColor = '#facc15'; ctx.strokeRect(drop.x - 15, drop.y - 15, 30, 30); ctx.shadowBlur = 0; });

    Object.values(gameState.players).forEach(p => {
      if (!p.alive || p.in_bush) return;
      const w_data = WEAPONS[p.weapon];
      const isOutsideZone = Math.hypot(p.x - z.x, p.y - z.y) > z.r;
      const dynColor = getDynamicColors(p.weapon, isOutsideZone);
      
      ctx.beginPath(); ctx.arc(p.x, p.y, w_data.max_rng, 0, Math.PI*2); 
      ctx.fillStyle = dynColor.fill; ctx.fill(); 
      ctx.strokeStyle = dynColor.stroke; ctx.lineWidth = 1.5; ctx.stroke();
    });

    gameState.projectiles.forEach(p => {
      if(p.type !== 'melee') { 
        ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI*2);
        let dColor = '#ffffff'; if(p.type === 'dagger') dColor = '#a855f7'; if(p.type === 'bow') dColor = '#eab308'; if(p.type === 'spear') dColor = '#3b82f6';
        ctx.fillStyle = dColor; ctx.shadowBlur = 10; ctx.shadowColor = dColor; ctx.fill(); ctx.shadowBlur = 0;
      }
    });

    Object.values(gameState.players).forEach(p => {
      if (!p.alive) {
        ctx.fillStyle = '#475569'; ctx.fillRect(p.x - 25, p.y - 25, 50, 50);
        ctx.fillStyle = '#ef4444'; ctx.font = '30px Arial'; ctx.textAlign = 'center'; ctx.fillText('❌', p.x, p.y + 10);
        return;
      }

      ctx.save(); 
      if(p.in_bush) ctx.globalAlpha = 0.5; 
      const isBerserk = p.hp < (p.max_hp * 0.3); const cx = p.x - cardW / 2; const cy = p.y - cardH / 2;

      ctx.fillStyle = p.color || '#1e293b'; 
      ctx.beginPath(); ctx.roundRect(cx, cy, cardW, cardH, 8); 
      ctx.fill();
      
      ctx.strokeStyle = p.flash_red ? '#ef4444' : (isBerserk ? '#f97316' : '#ffffff');
      ctx.lineWidth = p.flash_red ? 6 : (isBerserk ? 4 : 2);
      ctx.stroke(); 

      ctx.fillStyle = 'white'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(p.name.length > 8 ? p.name.substring(0,8)+'..' : p.name, p.x, cy + 22);

      ctx.font = '18px sans-serif'; 
      ctx.fillText(WEAPONS[p.weapon].e, cx + 18, cy + 48); 
      ctx.fillText(SHIELDS[p.shield].e, cx + cardW - 18, cy + 48);

      ctx.font = '45px sans-serif'; 
      ctx.fillText(p.avatar || '🐘', p.x, cy + 90);

      const hpBoxX = cx + 8; const hpBoxY = cy + cardH - 22; const hpBoxW = cardW - 16; const hpBoxH = 14; 
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(hpBoxX, hpBoxY, hpBoxW, hpBoxH);
      ctx.fillStyle = isBerserk ? '#ef4444' : '#22c55e'; ctx.fillRect(hpBoxX, hpBoxY, hpBoxW * Math.max(0, p.hp/p.max_hp), hpBoxH);
      ctx.fillStyle = 'white'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(`${Math.floor(p.hp)}`, p.x, hpBoxY + 11);
      ctx.restore(); 
    });

    let activeVfx =[];
    vfxRef.current.forEach(v => {
      if (v.type === 'slash') {
        ctx.beginPath(); ctx.moveTo(v.x, v.y); ctx.lineTo(v.tx, v.ty);
        ctx.strokeStyle = `rgba(220, 38, 38, ${v.life / 6})`; ctx.lineWidth = v.life * 3; ctx.stroke();
      } 
      else if (v.type === 'blood') {
        ctx.beginPath(); ctx.arc(v.x, v.y, v.life / 1.5, 0, Math.PI*2); ctx.fillStyle = `rgba(220, 38, 38, ${v.life / 10})`; ctx.fill();
        v.x += v.vx; v.y += v.vy;
      }
      else if (v.type === 'text') {
        ctx.fillStyle = v.color; ctx.font = '900 22px sans-serif'; ctx.textAlign = 'center';
        ctx.globalAlpha = Math.min(1, v.life / 20); ctx.shadowBlur = 4; ctx.shadowColor = 'rgba(255,255,255,0.5)'; ctx.fillText(v.text, v.x, v.y);
        ctx.globalAlpha = 1.0; ctx.shadowBlur = 0; v.y -= 1.5; 
      }
      v.life -= 1; if (v.life > 0) activeVfx.push(v);
    });
    vfxRef.current = activeVfx; 

  },[gameState]);

  return (
    <div className="flex flex-col lg:flex-row w-full h-full overflow-hidden min-h-0 bg-gray-950">
      <div className="flex-1 lg:flex-auto bg-gray-900 relative flex items-center justify-center p-2 min-h-[50vh] lg:min-h-0 border-b lg:border-b-0 lg:border-r border-gray-700">
        <canvas ref={canvasRef} width={gameState.config.map_width} height={gameState.config.map_height} className="w-full h-full object-contain rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.8)] bg-[#0f172a]" />
      </div>
      <div className="w-full lg:w-96 h-[30vh] lg:h-full bg-gray-800 flex flex-col shrink-0 min-h-0">
        <div className="p-2 md:p-3 bg-gray-900 font-bold border-b border-gray-700 text-purple-400 flex items-center justify-between gap-2 shadow-md z-10">
          <span className="text-sm md:text-base">🎙️ Caster Panel</span>
          {hostPwd === gameState.host_pwd && <button onClick={async () => { await fetch(`${API_URL}/${roomId}/force_end`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({pwd: hostPwd})}); }} className="bg-red-600 hover:bg-red-500 text-white px-2 py-1 md:px-3 md:py-1 rounded text-[10px] md:text-xs uppercase shadow-md transition-transform hover:scale-[1.05]">🛑 Ngừng</button>}
        </div>
        <div className="flex-1 overflow-y-auto p-2 md:p-4 space-y-2 flex flex-col-reverse custom-scrollbar">
          {gameState.logs.map((log, i) => (
            <div key={i} className={`p-2.5 rounded-lg text-xs md:text-sm font-semibold border-l-4 shadow-sm ${log.includes('💀') || log.includes('🛑') || log.includes('☠️') ? 'border-red-500 bg-red-900/20 text-red-200' : log.includes('💥') || log.includes('🎤') ? 'border-yellow-500 bg-yellow-900/20 text-yellow-200' : log.includes('🎁') || log.includes('💉') ? 'border-green-500 bg-green-900/20 text-green-200' : 'border-blue-500 bg-gray-700 text-gray-200'}`}>
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PhaseFinished({ roomId, gameState }) {
  const winner = Object.values(gameState.players).find(p => p.alive);
  const WEAPONS = gameState.config.weapons; const SHIELDS = gameState.config.shields;
  return (
    <div className="flex w-full items-center justify-center flex-col min-h-0 overflow-y-auto p-4 md:p-8 bg-gray-950">
      <div className="bg-gray-800 p-6 md:p-12 rounded-3xl border border-gray-700 text-center shadow-2xl max-w-4xl w-full relative overflow-hidden">
        <div className="absolute top-[-50px] left-[-50px] w-64 h-64 bg-yellow-400 opacity-10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="text-6xl md:text-8xl mb-4 md:mb-6 animate-bounce">🏆</div>
        <h2 className="text-3xl md:text-5xl font-black text-yellow-400 mb-2 uppercase drop-shadow-md">{winner ? winner.name : "HÒA NHAU"}</h2>
        <p className="text-sm md:text-xl text-gray-400 mb-6 md:mb-8 font-bold">Đã xuất sắc giành ngôi vị Quán quân!</p>
        
        {winner && (
          <div className="bg-gray-900 p-4 md:p-6 rounded-2xl border border-gray-700 shadow-lg flex flex-col md:flex-row gap-6 md:gap-8 text-left relative" style={{borderTopWidth: '8px', borderTopColor: winner.color}}>
            <div className="flex-1 border-b md:border-b-0 md:border-r border-gray-700 pb-4 md:pb-0 md:pr-6">
                <h3 className="text-blue-400 font-black text-lg md:text-xl border-b border-gray-700 pb-2 mb-4">THÔNG SỐ {winner.avatar}</h3>
                <p className="text-sm md:text-base text-gray-300 mb-2">Trang bị: {WEAPONS[winner.weapon].e} + {SHIELDS[winner.shield].e}</p>
                <p className="text-sm md:text-base text-gray-300 mb-2">Máu còn lại: <strong className="text-green-400">{Math.floor(winner.hp)} / {winner.max_hp}</strong></p>
                <p className="text-sm md:text-base text-gray-300 mb-2">Mục tiêu: <strong className="text-yellow-400">{TARGET_NAMES[winner.target_rule]}</strong></p>
                <p className="text-sm md:text-base text-gray-300">Sinh tồn: <strong className="text-purple-400">{CAMP_NAMES[winner.camp_rule]}</strong></p>
            </div>
            <div className="flex-1">
                <h3 className="text-red-400 font-black text-lg md:text-xl border-b border-gray-700 pb-2 mb-4">THỐNG KÊ CHIẾN ĐẤU</h3>
                <div className="grid grid-cols-2 gap-3 md:gap-4 mb-4">
                    <div className="bg-gray-800 p-2 md:p-3 rounded-xl border border-gray-700 shadow-sm">
                        <span className="text-[10px] md:text-xs text-gray-500 font-bold block uppercase">Đam Gây Ra</span>
                        <span className="text-base md:text-xl font-black text-red-500">💥 {Math.floor(winner.damage_dealt)}</span>
                    </div>
                    <div className="bg-gray-800 p-2 md:p-3 rounded-xl border border-gray-700 shadow-sm">
                        <span className="text-[10px] md:text-xs text-gray-500 font-bold block uppercase">Đã Gánh Chịu</span>
                        <span className="text-base md:text-xl font-black text-gray-300">🛡️ {Math.floor(winner.damage_taken)}</span>
                    </div>
                </div>
                <div className="bg-gray-800 p-3 rounded-xl border border-gray-700 shadow-sm">
                    <span className="text-[10px] md:text-xs text-gray-500 font-bold block uppercase mb-1">Danh sách Nạn Nhân ({winner.kills} mạng):</span>
                    <span className="text-xs md:text-sm font-bold text-gray-200">
                        {winner.killed_names && winner.killed_names.length > 0 ? winner.killed_names.join(', ') : 'Rất hiền lành, chưa giết ai!'}
                    </span>
                </div>
            </div>
          </div>
        )}
      </div>
      <button onClick={()=>fetch(`${API_URL}/${roomId}/phase/waiting`,{method:'POST'})} className="mt-6 md:mt-8 bg-gray-700 hover:bg-gray-600 text-white px-6 md:px-10 py-3 md:py-4 rounded-full font-bold text-sm md:text-xl shadow-lg transition-transform hover:scale-105">TRỞ VỀ SẢNH CHỜ</button>
    </div>
  );
}