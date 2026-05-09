from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import random, json, os, asyncio, math

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

DB_FILE = "game_data.json"
CONFIG_FILE = "game_config.json"

DEFAULT_STATS = {
    "weapons": {
        "dagger": {"name": "Dao găm", "icon": "🗡️", "color": "#94a3b8", "min_rng": 0, "rng": 40, "dmg": 18, "cd": 0.4, "wt": 5, "vfx": "slash", "desc": "Áp sát chém siêu nhanh."},
        "sword":  {"name": "Kiếm dài", "icon": "🤺", "color": "#ef4444", "min_rng": 0, "rng": 60, "dmg": 30, "cd": 1.0, "wt": 15, "vfx": "slash", "desc": "Cân bằng công thủ."},
        "spear":  {"name": "Trường giáo", "icon": "🔱", "color": "#f59e0b", "min_rng": 40, "rng": 120, "dmg": 25, "cd": 1.2, "wt": 20, "vfx": "thrust", "desc": "Đâm xa, lùi lại nếu địch lại gần."},
        "bow":    {"name": "Cung tiễn", "icon": "🏹", "color": "#22c55e", "min_rng": 80, "rng": 280, "dmg": 16, "cd": 0.8, "wt": 10, "vfx": "arrow", "desc": "Thả diều, không thể bắn cận chiến."},
        "magic":  {"name": "Gậy phép", "icon": "🪄", "color": "#3b82f6", "min_rng": 60, "rng": 200, "dmg": 45, "cd": 2.0, "wt": 10, "vfx": "magic", "desc": "Đam to, cần giữ khoảng cách."},
        "hammer": {"name": "Búa tạ", "icon": "🔨", "color": "#f97316", "min_rng": 0, "rng": 50, "dmg": 65, "cd": 2.5, "wt": 45, "vfx": "bash", "desc": "Phá giáp cực gắt nhưng rất nặng."}
    },
    "shields": {
        "buckler":      {"name": "Khiên nhỏ", "icon": "🥏", "def": 0, "wt": 5, "desc": "Chạy cực nhanh, không đỡ được đam."},
        "magic_ward":   {"name": "Khiên phép", "icon": "🔮", "def": 15, "wt": 10, "desc": "Giảm 15% sát thương."},
        "wood_shield":  {"name": "Khiên gỗ", "icon": "🪵", "def": 30, "wt": 20, "desc": "Giảm 30% sát thương. Cân bằng."},
        "steel_shield": {"name": "Khiên thép", "icon": "🛡️", "def": 55, "wt": 45, "desc": "Giảm 55% sát thương. Khá nặng."},
        "tower_shield": {"name": "Khiên tháp", "icon": "🧱", "def": 75, "wt": 70, "desc": "Bức tường di động. Giảm 75% sát thương."}
    },
    "synergies": {
        "dagger": ["magic_ward", "wood_shield"], "sword": ["wood_shield", "buckler"],
        "spear": ["steel_shield", "buckler"], "bow": ["magic_ward", "tower_shield"],
        "magic": ["steel_shield", "tower_shield"], "hammer": ["tower_shield", "steel_shield"]
    }
}

def load_game_config():
    if not os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "w", encoding="utf-8") as f: json.dump(DEFAULT_STATS, f, indent=4, ensure_ascii=False)
    with open(CONFIG_FILE, "r", encoding="utf-8") as f: return json.load(f)

def load_data():
    default_data = {"players": [], "config": {"title": "ULTIMATE ARENA", "bg": "#0f172a", "w": 800, "h": 600}}
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r") as f: 
                d = json.load(f)
                if "config" not in d: d["config"] = default_data["config"]
                if "players" not in d: d["players"] = []
                return d
        except: pass
    return default_data

def save_data(data):
    with open(DB_FILE, "w") as f: json.dump(data, f, indent=4)

def get_random_vibrant_hex():
    h = random.random(); s = 0.8 + random.random() * 0.2; l = 0.5 + random.random() * 0.2
    def hsl_to_rgb(h, s, l):
        c = (1 - abs(2 * l - 1)) * s; x = c * (1 - abs((h * 6) % 2 - 1)); m = l - c / 2
        if h < 1/6: r,g,b = c,x,0
        elif h < 2/6: r,g,b = x,c,0
        elif h < 3/6: r,g,b = 0,c,x
        elif h < 4/6: r,g,b = 0,x,c
        elif h < 5/6: r,g,b = x,0,c
        else: r,g,b = c,0,x
        return int((r+m)*255), int((g+m)*255), int((b+m)*255)
    return '#{:02x}{:02x}{:02x}'.format(*hsl_to_rgb(h, s, l))

db = load_data()
stats = load_game_config()
game_state = {
    "status": "waiting", "players": [], "particles": [], "logs": ["🎙️ Server đã sẵn sàng!"], "winner_info": None, "ready_count": 0, "timer": 0, "config": db["config"]
}
active_connections = []

class PlayerReg(BaseModel): name: str; password: str; weapon: str; shield: str
class PlayerStrategy(BaseModel): name: str; password: str; target_rule: str; camp_until: int
class ConfigModel(BaseModel): title: str; bg: str; w: int; h: int

async def broadcast_state():
    game_state["config"] = db["config"]
    msg = json.dumps(game_state)
    for conn in list(active_connections):
        try: await conn.send_text(msg)
        except: active_connections.remove(conn)

@app.get("/stats")
def get_stats(): return load_game_config()
@app.get("/lobby")
def get_lobby(): return db["players"]

@app.post("/register")
async def register(data: PlayerReg):
    if any(p["name"] == data.name for p in db["players"]): return {"status": "error", "message": "Tên đã tồn tại!"}
    db["players"].append(data.dict() | {"strategy": None, "color": get_random_vibrant_hex()})
    save_data(db); await broadcast_state(); return {"status": "success"}

@app.post("/add-bots")
async def add_bots():
    bot_names = [f"Bot_{i}" for i in range(1, 11)]
    for name in bot_names:
        if any(p["name"] == name for p in db["players"]): continue
        db["players"].append({
            "name": name, "password": "bot", "weapon": random.choice(list(stats["weapons"].keys())), "shield": random.choice(list(stats["shields"].keys())),
            "strategy": {"target_rule": random.choice(["closest", "lowest_hp", "counter"]), "camp_until": random.choice([99, 5, 3])},
            "color": get_random_vibrant_hex()
        })
    save_data(db); await broadcast_state(); return {"status": "success"}

@app.post("/start-now")
async def start_now():
    for p in db["players"]:
        if p["strategy"] is None:
            p["strategy"] = {"target_rule": random.choice(["closest", "lowest_hp", "highest_hp", "counter"]), "camp_until": random.choice([99, 5, 3, 2])}
    save_data(db); game_state["status"] = "playing"; await start_game_engine(); return {"status": "success"}

@app.post("/phase-strategy")
async def to_strat():
    game_state["status"] = "strategy"; await broadcast_state()
    asyncio.create_task(countdown_task()); return {"status": "success"}

@app.post("/update-strategy")
async def update_strat(data: PlayerStrategy):
    for p in db["players"]:
        if p["name"] == data.name:
            if p["password"] != data.password: return {"status": "error", "message": "Sai pass!"}
            p["strategy"] = {"target_rule": data.target_rule, "camp_until": data.camp_until}
            save_data(db)
            game_state["ready_count"] = len([px for px in db["players"] if px["strategy"]])
            await broadcast_state(); return {"status": "success"}
    return {"status": "error", "message": "Không tìm thấy tên!"}

@app.post("/rematch")
async def rematch():
    for p in db["players"]: p["strategy"] = None
    save_data(db); game_state.update({"status": "waiting", "winner_info": None, "logs": ["🎙️ Tái đấu! Anh em xếp lại chiến thuật!"], "timer": 0, "ready_count": 0, "players": []})
    await broadcast_state(); return {"status": "success"}

@app.post("/reset-all")
async def reset_all():
    db["players"] = []; save_data(db)
    game_state.update({"status": "waiting", "players": [], "winner_info": None, "logs": [], "timer": 0, "ready_count": 0})
    await broadcast_state(); return {"status": "success"}

@app.delete("/player/{name}")
async def delete_player(name: str):
    db["players"] = [p for p in db["players"] if p["name"] != name]
    save_data(db); await broadcast_state(); return {"status": "success"}

async def countdown_task():
    game_state["timer"] = 180
    while game_state["status"] == "strategy" and game_state["timer"] > 0:
        await asyncio.sleep(1); game_state["timer"] -= 1; await broadcast_state()
    if game_state["status"] == "strategy": await start_game_engine()

async def start_game_engine():
    conf = db["config"]; players = []; st = load_game_config()
    game_state["logs"] = ["🎙️ TRẬN CHIẾN BẮT ĐẦU!"]
    for p in db["players"]:
        w, s = st["weapons"][p["weapon"]], st["shields"][p["shield"]]
        speed = max(20, 150 - (w["wt"] + s["wt"]))
        players.append({
            "name": p["name"], "weapon": p["weapon"], "shield": p["shield"], 
            "icon": w["icon"], "s_icon": s["icon"], "color": p.get("color", "#fff"),
            "x": random.randint(50, conf["w"]-50), "y": random.randint(50, conf["h"]-50),
            "hp": 200, "max_hp": 200, "min_rng": w.get("min_rng", 0), "range": w["rng"], "speed": speed, 
            "dmg": w["dmg"], "def_percent": s["def"], "cd": 0, "max_cd": w["cd"] * 10, 
            "strat": p["strategy"], "vfx": w["vfx"]
        })
    game_state["status"] = "playing"; game_state["players"] = players; await broadcast_state(); asyncio.create_task(game_loop())

async def game_loop():
    conf = db["config"]; tick = 0.1; st = load_game_config()
    start_time = asyncio.get_event_loop().time()
    
    while game_state["status"] == "playing":
        ps = game_state["players"]; alive = [p for p in ps if p["hp"] > 0]
        match_time = int(asyncio.get_event_loop().time() - start_time)

        if len(alive) <= 1:
            game_state["status"] = "finished"; game_state["winner_info"] = alive[0] if alive else None
            game_state["logs"].append(f"🏆 TRẬN ĐẤU KẾT THÚC SAU {match_time} GIÂY!")
            await broadcast_state(); break
        
        game_state["particles"] = []
        for p in alive:
            if p["cd"] > 0: p["cd"] -= 1
            enemies = [e for e in alive if e["name"] != p["name"]]
            if not enemies: continue
            
            closest = min(enemies, key=lambda e: math.hypot(e["x"]-p["x"], e["y"]-p["y"]))
            dist_to_closest = math.hypot(closest["x"]-p["x"], closest["y"]-p["y"])

            # 1. NÚP LÙM (Sợ hãi bỏ chạy)
            if len(alive) > p["strat"]["camp_until"]:
                if dist_to_closest < 350:
                    dx, dy = closest["x"] - p["x"], closest["y"] - p["y"]
                    mag = max(dist_to_closest, 0.1)
                    move_x, move_y = -(dx/mag), -(dy/mag)
                    # Né tường
                    if p["x"] < 100: move_x += 1.0
                    if p["x"] > conf["w"] - 100: move_x -= 1.0
                    if p["y"] < 100: move_y += 1.0
                    if p["y"] > conf["h"] - 100: move_y -= 1.0
                    f_mag = max(math.hypot(move_x, move_y), 0.1)
                    p["x"] += (move_x/f_mag) * (p["speed"] * 1.4) * tick
                    p["y"] += (move_y/f_mag) * (p["speed"] * 1.4) * tick
                continue

            # 2. XÁC ĐỊNH MỤC TIÊU TẤN CÔNG
            rule = p["strat"]["target_rule"]
            if rule == "lowest_hp": target = min(enemies, key=lambda e: e["hp"])
            elif rule == "highest_hp": target = max(enemies, key=lambda e: e["hp"])
            elif rule == "counter":
                cnts = [e for e in enemies if e["shield"] in st["synergies"].get(p["weapon"], [])]
                target = min(cnts, key=lambda e: math.hypot(e["x"]-p["x"], e["y"]-p["y"])) if cnts else closest
            else: target = closest

            dist = math.hypot(target["x"]-p["x"], target["y"]-p["y"])
            ang = math.atan2(target["y"]-p["y"], target["x"]-p["x"])

            # 3. KITING (Thả diều) & CHASER (Truy đuổi)
            if dist < p["min_rng"]:
                # Địch vào quá gần (Ví dụ cầm Cung bị Kiếm áp sát) -> Bỏ chạy ngược lại
                p["x"] -= math.cos(ang) * p["speed"] * tick
                p["y"] -= math.sin(ang) * p["speed"] * tick
            elif dist > p["range"] - 10:
                # Địch ở quá xa -> Chạy tới
                p["x"] += math.cos(ang) * p["speed"] * tick
                p["y"] += math.sin(ang) * p["speed"] * tick
            elif p["cd"] <= 0:
                # TRONG TẦM ĐÁNH -> Khai hỏa
                synergy_mult = 1.5 if target["shield"] in st["synergies"].get(p["weapon"], []) else 1.0
                def_mult = 1.0 - (target["def_percent"] / 100.0)
                final_dmg = max(1, int(p["dmg"] * synergy_mult * def_mult))
                target["hp"] -= final_dmg
                p["cd"] = p["max_cd"]
                
                game_state["particles"].append({"x1": p["x"], "y1": p["y"], "x2": target["x"], "y2": target["y"], "c": p["color"], "type": p["vfx"]})
                
                if target["hp"] <= 0: game_state["logs"].append(f"[{match_time}s] 💀 {p['name']} tiễn {target['name']} lên bảng đếm số!")
                elif synergy_mult > 1.0 and random.random() > 0.8: game_state["logs"].append(f"[{match_time}s] ⚠️ {p['name']} giáng đòn khắc hệ vào {target['name']}!")

            # Chặn ranh giới map
            p["x"] = max(20, min(conf["w"]-20, p["x"])); p["y"] = max(20, min(conf["h"]-20, p["y"]))
            
        await broadcast_state(); await asyncio.sleep(tick)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept(); active_connections.append(websocket)
    try:
        await websocket.send_text(json.dumps(game_state))
        while True: await websocket.receive_text()
    except:
        if websocket in active_connections: active_connections.remove(websocket)

@app.post("/config")
async def update_config(c: ConfigModel):
    db["config"] = c.dict(); save_data(db); await broadcast_state(); return {"status": "success"}