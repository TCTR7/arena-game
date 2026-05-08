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
        "dagger": {"name": "Dao găm", "icon": "🗡️", "color": "#94a3b8", "rng": 40, "dmg": 18, "cd": 0.4, "wt": 5, "vfx": "slash", "desc": "Chém siêu nhanh, siêu nhẹ."},
        "sword":  {"name": "Kiếm dài", "icon": "🤺", "color": "#ef4444", "rng": 60, "dmg": 30, "cd": 1.0, "wt": 15, "vfx": "slash", "desc": "Cân bằng công thủ."},
        "spear":  {"name": "Trường giáo", "icon": "🔱", "color": "#f59e0b", "rng": 120, "dmg": 25, "cd": 1.2, "wt": 20, "vfx": "thrust", "desc": "Giữ khoảng cách cực tốt."},
        "bow":    {"name": "Cung tiễn", "icon": "🏹", "color": "#22c55e", "rng": 280, "dmg": 16, "cd": 0.8, "wt": 10, "vfx": "arrow", "desc": "Thả diều từ xa."},
        "magic":  {"name": "Gậy phép", "icon": "🪄", "color": "#3b82f6", "rng": 200, "dmg": 45, "cd": 2.0, "wt": 10, "vfx": "magic", "desc": "Sát thương dồn cực mạnh."},
        "hammer": {"name": "Búa tạ", "icon": "🔨", "color": "#f97316", "rng": 50, "dmg": 65, "cd": 2.5, "wt": 45, "vfx": "bash", "desc": "Phá giáp cực gắt nhưng rất nặng."}
    },
    "shields": {
        "buckler":      {"name": "Khiên nhỏ", "icon": "🥏", "def": 0, "wt": 5, "desc": "Chạy cực nhanh, không đỡ được đam."},
        "magic_ward":   {"name": "Khiên phép", "icon": "🔮", "def": 15, "wt": 10, "desc": "Giảm 15% sát thương."},
        "wood_shield":  {"name": "Khiên gỗ", "icon": "🪵", "def": 30, "wt": 20, "desc": "Giảm 30% sát thương. Cân bằng."},
        "steel_shield": {"name": "Khiên thép", "icon": "🛡️", "def": 55, "wt": 45, "desc": "Giảm 55% sát thương. Khá nặng."},
        "tower_shield": {"name": "Khiên tháp", "icon": "🧱", "def": 75, "wt": 70, "desc": "Bức tường di động. Giảm 75% sát thương."}
    },
    "synergies": {
        "dagger": ["magic_ward", "wood_shield"],
        "sword": ["wood_shield", "buckler"],
        "spear": ["steel_shield", "buckler"],
        "bow": ["magic_ward", "tower_shield"],
        "magic": ["steel_shield", "tower_shield"],
        "hammer": ["tower_shield", "steel_shield"]
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

db = load_data()
stats = load_game_config()

game_state = {
    "status": "waiting", "players": [], "particles": [], 
    "logs": ["🎙️ Hệ thống đã cập nhật chỉ số!"], 
    "winner_info": None, "ready_count": 0, "timer": 0, "config": db["config"]
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
        except: 
            if conn in active_connections: active_connections.remove(conn)

@app.get("/stats")
def get_stats(): return load_game_config()

@app.get("/lobby")
def get_lobby(): return db["players"]

@app.post("/register")
async def register(data: PlayerReg):
    if any(p["name"] == data.name for p in db["players"]): return {"status": "error", "message": "Tên đã tồn tại!"}
    db["players"].append(data.dict() | {"strategy": None})
    save_data(db); await broadcast_state(); return {"status": "success"}

# --- TÍNH NĂNG THÊM 10 BOTS TỰ ĐỘNG ---
@app.post("/add-bots")
async def add_bots():
    bot_names = ["Bot_Yasuo", "Bot_Garen", "Bot_Ashe", "Bot_Ahri", "Bot_Darius", "Bot_Zed", "Bot_Lux", "Bot_LeeSin", "Bot_Vayne", "Bot_Malphite"]
    weapons = list(stats["weapons"].keys())
    shields = list(stats["shields"].keys())
    rules = ["closest", "lowest_hp", "highest_hp", "counter"]
    camps = [99, 5, 3, 2]

    for name in bot_names:
        if any(p["name"] == name for p in db["players"]): continue
        db["players"].append({
            "name": name,
            "password": "bot",
            "weapon": random.choice(weapons),
            "shield": random.choice(shields),
            "strategy": {
                "target_rule": random.choice(rules),
                "camp_until": random.choice(camps)
            }
        })
    save_data(db)
    await broadcast_state()
    return {"status": "success"}

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

@app.post("/phase-strategy")
async def to_strat():
    game_state["status"] = "strategy"; await broadcast_state()
    asyncio.create_task(countdown_task()); return {"status": "success"}

@app.post("/rematch")
async def rematch():
    for p in db["players"]: p["strategy"] = None
    save_data(db)
    game_state.update({"status": "waiting", "winner_info": None, "logs": ["🎙️ Mọi người hãy nạp lại chiến thuật cho trận tái đấu!"], "timer": 0, "ready_count": 0, "players": []})
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
        if len([p for p in db["players"] if p["strategy"]]) >= len(db["players"]) and len(db["players"]) >= 2: break
        await asyncio.sleep(1); game_state["timer"] -= 1; await broadcast_state()
    if game_state["status"] == "strategy":
        for p in db["players"]:
            if not p["strategy"]: p["strategy"] = {"target_rule": "closest", "camp_until": 99}
        await auto_start_logic()

async def auto_start_logic():
    for i in range(3, 0, -1):
        game_state["logs"] = [f"🎙️ HỆ THỐNG KHỞI ĐỘNG SAU {i}..."]
        await broadcast_state(); await asyncio.sleep(1)
    await start_game_engine()

async def start_game_engine():
    conf = db["config"]; players = []; st = load_game_config()
    for p in db["players"]:
        w, s = st["weapons"][p["weapon"]], st["shields"][p["shield"]]
        speed = max(20, 150 - (w["wt"] + s["wt"]))
        players.append({
            "name": p["name"], "weapon": p["weapon"], "shield": p["shield"], 
            "icon": w["icon"], "s_icon": s["icon"], "color": w["color"],
            "x": random.randint(50, conf["w"]-50), "y": random.randint(50, conf["h"]-50),
            "hp": 200, "max_hp": 200, "range": w["rng"], "speed": speed, 
            "dmg": w["dmg"], "def_percent": s["def"], "cd": 0, "max_cd": w["cd"] * 10, 
            "strat": p["strategy"], "vfx": w["vfx"]
        })
    game_state["status"] = "playing"; game_state["players"] = players; await broadcast_state(); asyncio.create_task(game_loop())

async def game_loop():
    conf = db["config"]; tick = 0.1; st = load_game_config()
    while game_state["status"] == "playing":
        ps = game_state["players"]; alive = [p for p in ps if p["hp"] > 0]
        if len(alive) <= 1:
            game_state["status"] = "finished"; game_state["winner_info"] = alive[0] if alive else None
            await broadcast_state(); break
        
        game_state["particles"] = []
        for p in alive:
            if p["cd"] > 0: p["cd"] -= 1
            enemies = [e for e in alive if e["name"] != p["name"]]
            if not enemies: continue
            
            closest = min(enemies, key=lambda e: math.hypot(e["x"]-p["x"], e["y"]-p["y"]))
            dist_to_closest = math.hypot(closest["x"]-p["x"], closest["y"]-p["y"])

            if len(alive) > p["strat"]["camp_until"]:
                if dist_to_closest < 350:
                    dx, dy = closest["x"] - p["x"], closest["y"] - p["y"]
                    mag = max(dist_to_closest, 0.1)
                    move_x, move_y = -(dx/mag), -(dy/mag)
                    if p["x"] < 100: move_x += 1.0
                    if p["x"] > conf["w"] - 100: move_x -= 1.0
                    if p["y"] < 100: move_y += 1.0
                    if p["y"] > conf["h"] - 100: move_y -= 1.0
                    f_mag = max(math.hypot(move_x, move_y), 0.1)
                    p["x"] += (move_x/f_mag) * (p["speed"] * 1.4) * tick
                    p["y"] += (move_y/f_mag) * (p["speed"] * 1.4) * tick
                continue

            rule = p["strat"]["target_rule"]
            if rule == "lowest_hp": target = min(enemies, key=lambda e: e["hp"])
            elif rule == "highest_hp": target = max(enemies, key=lambda e: e["hp"])
            elif rule == "counter":
                cnts = [e for e in enemies if e["shield"] in st["synergies"].get(p["weapon"], [])]
                target = min(cnts, key=lambda e: math.hypot(e["x"]-p["x"], e["y"]-p["y"])) if cnts else closest
            else: target = closest

            dist = math.hypot(target["x"]-p["x"], target["y"]-p["y"])
            if dist > p["range"] - 10:
                ang = math.atan2(target["y"]-p["y"], target["x"]-p["x"])
                p["x"] += math.cos(ang) * p["speed"] * tick
                p["y"] += math.sin(ang) * p["speed"] * tick
            elif p["cd"] <= 0:
                synergy_mult = 1.5 if target["shield"] in st["synergies"].get(p["weapon"], []) else 1.0
                def_mult = 1.0 - (target["def_percent"] / 100.0)
                target["hp"] -= max(1, int(p["dmg"] * synergy_mult * def_mult))
                p["cd"] = p["max_cd"]
                game_state["particles"].append({"x1": p["x"], "y1": p["y"], "x2": target["x"], "y2": target["y"], "c": p["color"], "type": p["vfx"]})
                if target["hp"] <= 0: game_state["logs"].append(f"💀 {p['name']} tiễn {target['name']} lên bảng!")
            
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