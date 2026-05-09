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
        "dagger": {"name": "Dao găm", "icon": "🗡️", "color": "#94a3b8", "min_rng": 0, "rng": 35, "dmg": 12, "cd": 0.3, "wt": 2, "vfx": "slash", "desc": "Ám sát nhanh."},
        "sword":  {"name": "Kiếm dài", "icon": "🤺", "color": "#ef4444", "min_rng": 0, "rng": 50, "dmg": 25, "cd": 1.0, "wt": 15, "vfx": "slash", "desc": "Cân bằng."},
        "spear":  {"name": "Trường giáo", "icon": "🔱", "color": "#f59e0b", "min_rng": 35, "rng": 90, "dmg": 22, "cd": 1.2, "wt": 20, "vfx": "thrust", "desc": "Đâm thấu giáp."},
        "bow":    {"name": "Cung tiễn", "icon": "🏹", "color": "#22c55e", "min_rng": 70, "rng": 180, "dmg": 18, "cd": 0.8, "wt": 10, "vfx": "arrow", "desc": "Thả diều."},
        "hammer": {"name": "Búa tạ", "icon": "🔨", "color": "#f97316", "min_rng": 0, "rng": 45, "dmg": 65, "cd": 2.2, "wt": 40, "vfx": "bash", "desc": "Sát thương khủng."}
    },
    "shields": {
        "buckler":      {"name": "Khiên nhỏ", "icon": "🥏", "def": 5, "wt": 2, "desc": "Siêu nhẹ."},
        "wood_shield":  {"name": "Khiên gỗ", "icon": "🪵", "def": 35, "wt": 20, "desc": "Phòng thủ ổn."},
        "steel_shield": {"name": "Khiên thép", "icon": "🛡️", "def": 65, "wt": 60, "desc": "Xe tăng bọc thép."}
    },
    "synergies": {
        "dagger": ["wood_shield"], "sword": ["wood_shield", "buckler"],
        "spear": ["steel_shield", "buckler"], "bow": ["buckler", "wood_shield"], "hammer": ["steel_shield"]
    }
}

def load_game_config():
    if not os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "w", encoding="utf-8") as f: json.dump(DEFAULT_STATS, f, indent=4, ensure_ascii=False)
    with open(CONFIG_FILE, "r", encoding="utf-8") as f: return json.load(f)

def load_data():
    default_data = {"players": [], "config": {"title": "ULTIMATE ARENA", "bg": "#0f172a", "w": 800, "h": 600, "lang": "vi"}}
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r") as f: 
                d = json.load(f)
                if "config" not in d: d["config"] = default_data["config"]
                if "lang" not in d["config"]: d["config"]["lang"] = "vi"
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
game_state = {"status": "waiting", "players": [], "particles": [], "logs": [], "winner_info": None, "ready_count": 0, "timer": 0, "config": db["config"]}
active_connections = []

class PlayerReg(BaseModel): name: str; password: str; weapon: str; shield: str
class PlayerStrategy(BaseModel): name: str; password: str; target_rule: str; camp_until: int
class ConfigModel(BaseModel): title: str; bg: str; w: int; h: int; lang: str

# Helpers Song Ngữ
def log_start(lang): return "🎙️ TRẬN ĐẤU KHAI MÀN!" if lang == 'vi' else "🎙️ THE MATCH HAS BEGUN!"
def log_berserk(lang, name, time): return f"🔥 [{time}s] {name} hóa điên bật mode tử chiến!" if lang == 'vi' else f"🔥 [{time}s] {name} goes BERSERK!"
def log_kill(lang, killer, victim, time): return f"[{time}s] 💀 {killer} tiễn {victim} lên bảng!" if lang == 'vi' else f"[{time}s] 💀 {killer} eliminated {victim}!"
def log_crit(lang, killer, victim, time): return f"[{time}s] ⚡ {killer} giáng đòn CHÍ MẠNG vào {victim}!" if lang == 'vi' else f"[{time}s] ⚡ {killer} landed a CRITICAL hit on {victim}!"

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
    if any(p["name"] == data.name for p in db["players"]): return {"status": "error", "message": "Name exists!"}
    db["players"].append(data.dict() | {"strategy": None, "color": get_random_vibrant_hex()})
    save_data(db); await broadcast_state(); return {"status": "success"}

@app.post("/add-bots")
async def add_bots():
    bot_names = ["Bot_Yasuo", "Bot_Garen", "Bot_Ashe", "Bot_Ahri", "Bot_Darius", "Bot_Zed", "Bot_Lux", "Bot_LeeSin", "Bot_Vayne", "Bot_Malphite"]
    for name in bot_names:
        if any(p["name"] == name for p in db["players"]): continue
        db["players"].append({
            "name": name, "password": "bot", "weapon": random.choice(list(stats["weapons"].keys())), "shield": random.choice(list(stats["shields"].keys())),
            "strategy": {"target_rule": random.choice(["closest", "lowest_hp", "counter"]), "camp_until": random.choices([99, 5, 3], weights=[70, 15, 15])[0]},
            "color": get_random_vibrant_hex()
        })
    save_data(db); await broadcast_state(); return {"status": "success"}

@app.post("/start-now")
async def start_now():
    for p in db["players"]:
        if p["strategy"] is None:
            p["strategy"] = {"target_rule": random.choice(["closest", "lowest_hp", "counter"]), "camp_until": random.choices([99, 5, 3], weights=[70, 15, 15])[0]}
    save_data(db); game_state["status"] = "playing"; await start_game_engine(); return {"status": "success"}

@app.post("/phase-strategy")
async def to_strat():
    game_state["status"] = "strategy"; await broadcast_state()
    asyncio.create_task(countdown_task()); return {"status": "success"}

@app.post("/update-strategy")
async def update_strat(data: PlayerStrategy):
    for p in db["players"]:
        if p["name"] == data.name:
            if p["password"] != data.password: return {"status": "error", "message": "Wrong pass!"}
            p["strategy"] = {"target_rule": data.target_rule, "camp_until": data.camp_until}
            save_data(db); game_state["ready_count"] = len([px for px in db["players"] if px["strategy"]])
            await broadcast_state(); return {"status": "success"}
    return {"status": "error", "message": "Player not found!"}

@app.post("/rematch")
async def rematch():
    for p in db["players"]: p["strategy"] = None
    save_data(db); game_state.update({"status": "waiting", "winner_info": None, "logs": [], "timer": 0, "ready_count": 0, "players": []})
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
    game_state["logs"] = [log_start(conf.get("lang", "vi"))]
    for p in db["players"]:
        w, s = st["weapons"][p["weapon"]], st["shields"][p["shield"]]
        speed = max(30, 160 - (w["wt"] + s["wt"]))
        players.append({
            "name": p["name"], "weapon": p["weapon"], "shield": p["shield"], 
            "icon": w["icon"], "s_icon": s["icon"], "color": p.get("color", "#fff"),
            "x": random.randint(50, conf["w"]-50), "y": random.randint(50, conf["h"]-50),
            "hp": 300, "max_hp": 300, "min_rng": w.get("min_rng", 0), "range": w["rng"], "speed": speed, 
            "dmg": w["dmg"], "def_percent": s["def"], "cd": 0, "max_cd": w["cd"] * 10, 
            "strat": p["strategy"], "vfx": w["vfx"],
            "wander_angle": random.uniform(0, math.pi * 2) # Góc đi dạo ban đầu
        })
    game_state["status"] = "playing"; game_state["players"] = players; await broadcast_state(); asyncio.create_task(game_loop())

async def game_loop():
    conf = db["config"]; tick = 0.1; st = load_game_config()
    start_time = asyncio.get_event_loop().time()
    
    while game_state["status"] == "playing":
        lang = conf.get("lang", "vi")
        ps = game_state["players"]; alive = [p for p in ps if p["hp"] > 0]
        match_time = int(asyncio.get_event_loop().time() - start_time)

        if len(alive) <= 1:
            game_state["status"] = "finished"; game_state["winner_info"] = alive[0] if alive else None
            await broadcast_state(); break
        
        game_state["particles"] = []
        for p in alive:
            try:
                if p["cd"] > 0: p["cd"] -= 1
                enemies = [e for e in alive if e["name"] != p["name"]]
                if not enemies: continue

                rule = p["strat"]["target_rule"]
                if rule == "lowest_hp": target = min(enemies, key=lambda e: e["hp"])
                elif rule == "highest_hp": target = max(enemies, key=lambda e: e["hp"])
                elif rule == "counter":
                    cnts = [e for e in enemies if e["shield"] in st["synergies"].get(p["weapon"], [])]
                    target = min(cnts, key=lambda e: math.hypot(e["x"]-p["x"], e["y"]-p["y"])) if cnts else min(enemies, key=lambda e: math.hypot(e["x"]-p["x"], e["y"]-p["y"]))
                else: target = min(enemies, key=lambda e: math.hypot(e["x"]-p["x"], e["y"]-p["y"]))

                dist_to_target = math.hypot(target["x"]-p["x"], target["y"]-p["y"])
                ang_to_target = math.atan2(target["y"]-p["y"], target["x"]-p["x"])

                if p["hp"] < 90 and p["strat"]["camp_until"] < 99:
                    p["strat"]["camp_until"] = 99
                    game_state["logs"].append(log_berserk(lang, p['name'], match_time))

                is_fleeing = len(alive) > p["strat"]["camp_until"]
                
                if is_fleeing:
                    move_x, move_y = 0.0, 0.0
                    in_danger = False
                    for e in enemies:
                        dist = math.hypot(e["x"] - p["x"], e["y"] - p["y"])
                        danger_zone = e["range"] + 40
                        if dist < danger_zone:
                            in_danger = True
                            push = (danger_zone - dist) / danger_zone
                            dx, dy = p["x"] - e["x"], p["y"] - e["y"]
                            mag = max(math.hypot(dx, dy), 0.1)
                            move_x += (dx / mag) * push; move_y += (dy / mag) * push

                    if in_danger:
                        if p["x"] < 100: move_x += 1.5
                        if p["x"] > conf["w"] - 100: move_x -= 1.5
                        if p["y"] < 100: move_y += 1.5
                        if p["y"] > conf["h"] - 100: move_y -= 1.5
                        f_mag = max(math.hypot(move_x, move_y), 0.1)
                        p["x"] += (move_x / f_mag) * (p["speed"] * 1.5) * tick
                        p["y"] += (move_y / f_mag) * (p["speed"] * 1.5) * tick
                    else:
                        # --- LOGIC ĐI DẠO MỚI (SMOOTH WANDERING) ---
                        # Thay đổi góc đi dạo một chút mỗi tick (tạo đường cong)
                        p["wander_angle"] += random.uniform(-0.3, 0.3)
                        p["x"] += math.cos(p["wander_angle"]) * (p["speed"] * 0.4) * tick
                        p["y"] += math.sin(p["wander_angle"]) * (p["speed"] * 0.4) * tick
                        
                        # Nếu chạm tường thì xoay ngược lại
                        if p["x"] < 50 or p["x"] > conf["w"]-50 or p["y"] < 50 or p["y"] > conf["h"]-50:
                            p["wander_angle"] += math.pi
                else:
                    if dist_to_target < p["min_rng"]:
                        p["x"] -= math.cos(ang_to_target) * p["speed"] * tick
                        p["y"] -= math.sin(ang_to_target) * p["speed"] * tick
                    elif dist_to_target > p["range"] - 5:
                        p["x"] += math.cos(ang_to_target) * p["speed"] * tick
                        p["y"] += math.sin(ang_to_target) * p["speed"] * tick

                p["x"] = max(20, min(conf["w"]-20, p["x"])); p["y"] = max(20, min(conf["h"]-20, p["y"]))

                # TẤN CÔNG
                if p["cd"] <= 0:
                    enemies_in_range = [e for e in enemies if p["min_rng"] <= math.hypot(e["x"]-p["x"], e["y"]-p["y"]) <= p["range"]]
                    if enemies_in_range:
                        attack_target = target if (not is_fleeing and target in enemies_in_range) else min(enemies_in_range, key=lambda e: math.hypot(e["x"]-p["x"], e["y"]-p["y"]))
                        
                        synergy_mult = 2.0 if attack_target["shield"] in st["synergies"].get(p["weapon"], []) else 1.0
                        def_mult = 1.0 - (attack_target["def_percent"] / 100.0)
                        final_dmg = max(1, int(p["dmg"] * synergy_mult * def_mult))
                        attack_target["hp"] -= final_dmg
                        p["cd"] = p["max_cd"]
                        
                        game_state["particles"].append({"x1": p["x"], "y1": p["y"], "x2": attack_target["x"], "y2": attack_target["y"], "c": p["color"], "type": p["vfx"]})
                        
                        if attack_target["hp"] <= 0: 
                            game_state["logs"].append(log_kill(lang, p['name'], attack_target['name'], match_time))
                        elif synergy_mult > 1.0 and random.random() > 0.9: 
                            game_state["logs"].append(log_crit(lang, p['name'], attack_target['name'], match_time))
            except: pass
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