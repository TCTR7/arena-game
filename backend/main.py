from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import random, json, os, asyncio, math

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

DB_FILE = "game_data.json"

def load_data():
    default_data = {"players": [], "config": {"title": "ARENA ULTIMATE", "bg": "#0f172a", "w": 800, "h": 600}}
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r") as f: 
                data = json.load(f)
                if "config" not in data: data["config"] = default_data["config"]
                if "players" not in data: data["players"] = []
                return data
        except: pass
    return default_data

def save_data(data):
    with open(DB_FILE, "w") as f: json.dump(data, f, indent=4)

db = load_data()
game_state = {
    "status": "waiting", "players": [], "particles": [], 
    "logs": ["🎙️ Hệ thống đã khôi phục dữ liệu!"], 
    "winner_info": None, "ready_count": 0, "timer": 0, "config": db["config"]
}
active_connections = []

class PlayerReg(BaseModel): name: str; password: str; weapon: str; shield: str
class PlayerStrategy(BaseModel): name: str; password: str; target_rule: str; camp_until: int
class ConfigModel(BaseModel): title: str; bg: str; w: int; h: int

W_MAP = {
    "dagger": {"icon": "🗡️", "color": "#94a3b8", "rng": 40, "dmg": 16, "cd": 0.5, "wt": 2},
    "sword":  {"icon": "🤺", "color": "#ef4444", "rng": 55, "dmg": 26, "cd": 1.0, "wt": 10},
    "spear":  {"icon": "🔱", "color": "#f59e0b", "rng": 100, "dmg": 24, "cd": 1.3, "wt": 15},
    "bow":    {"icon": "🏹", "color": "#22c55e", "rng": 260, "dmg": 18, "cd": 0.8, "wt": 5},
    "magic":  {"icon": "🪄", "color": "#3b82f6", "rng": 180, "dmg": 38, "cd": 1.6, "wt": 5},
    "hammer": {"icon": "🔨", "color": "#f97316", "rng": 45, "dmg": 52, "cd": 2.3, "wt": 35}
}
S_MAP = {
    "buckler":      {"icon": "🥏", "wt": 2},
    "magic_ward":   {"icon": "🔮", "wt": 5},
    "wood_shield":  {"icon": "🪵", "wt": 12},
    "steel_shield": {"icon": "🛡️", "wt": 25},
    "tower_shield": {"icon": "🧱", "wt": 45}
}
SYNERGY = {
    "dagger": ["magic_ward", "wood_shield"], "sword": ["wood_shield", "buckler"],
    "spear": ["steel_shield", "wood_shield"], "bow": ["magic_ward", "buckler"],
    "magic": ["steel_shield", "tower_shield"], "hammer": ["tower_shield", "steel_shield"]
}

async def broadcast_state():
    game_state["config"] = db["config"]
    msg = json.dumps(game_state)
    for conn in list(active_connections):
        try: await conn.send_text(msg)
        except: 
            if conn in active_connections: active_connections.remove(conn)

@app.post("/config")
async def update_config(c: ConfigModel):
    db["config"] = c.model_dump(); save_data(db); await broadcast_state(); return {"status": "success"}

@app.post("/register")
async def register(data: PlayerReg):
    if any(p["name"] == data.name for p in db["players"]): return {"status": "error", "message": "Tên đã tồn tại!"}
    db["players"].append(data.model_dump() | {"strategy": None})
    save_data(db); await broadcast_state(); return {"status": "success"}

@app.delete("/player/{name}")
async def delete_player(name: str):
    db["players"] = [p for p in db["players"] if p["name"] != name]
    save_data(db); await broadcast_state(); return {"status": "success"}

@app.get("/lobby")
def get_lobby(): return db["players"]

@app.post("/phase-strategy")
async def to_strat():
    game_state["status"] = "strategy"; await broadcast_state()
    asyncio.create_task(countdown_task()); return {"status": "success"}

@app.post("/reset")
async def reset():
    db["players"] = []; save_data(db)
    game_state.update({"status": "waiting", "players": [], "winner_info": None, "logs": [], "timer": 0, "ready_count": 0})
    await broadcast_state(); return {"status": "success"}

@app.post("/update-strategy")
async def update_strat(data: PlayerStrategy):
    for p in db["players"]:
        if p["name"] == data.name:
            if p["password"] != data.password: return {"status": "error", "message": "Sai mật khẩu!"}
            p["strategy"] = {"target_rule": data.target_rule, "camp_until": data.camp_until}
            save_data(db)
            game_state["ready_count"] = len([px for px in db["players"] if px["strategy"]])
            await broadcast_state()
            return {"status": "success"}
    return {"status": "error", "message": "Không tìm thấy tên!"}

async def countdown_task():
    game_state["timer"] = 45
    while game_state["status"] == "strategy" and game_state["timer"] > 0:
        if len([p for p in db["players"] if p["strategy"]]) >= len(db["players"]) and len(db["players"]) >= 2: break
        await asyncio.sleep(1); game_state["timer"] -= 1; await broadcast_state()
    if game_state["status"] == "strategy":
        for p in db["players"]:
            if not p["strategy"]: p["strategy"] = {"target_rule": "closest", "camp_until": 99}
        await auto_start_logic()

async def auto_start_logic():
    for i in range(3, 0, -1):
        game_state["logs"] = [f"🎙️ KHAI CHIẾN SAU {i}..."]
        await broadcast_state(); await asyncio.sleep(1)
    await start_game_engine()

async def start_game_engine():
    conf = db["config"]; players = []
    for p in db["players"]:
        w, s = W_MAP[p["weapon"]], S_MAP[p["shield"]]
        speed = max(25, 105 - (w["wt"] + s["wt"]))
        players.append({
            "name": p["name"], "weapon": p["weapon"], "shield": p["shield"], "icon": w["icon"], "s_icon": s["icon"],
            "x": random.randint(50, conf["w"]-50), "y": random.randint(50, conf["h"]-50), "color": w["color"],
            "hp": 100, "max_hp": 100, "range": w["rng"], "speed": speed, "dmg": w["dmg"], "cd": 0, "max_cd": w["cd"] * 10, "strat": p["strategy"]
        })
    game_state["status"] = "playing"; game_state["players"] = players; await broadcast_state(); asyncio.create_task(game_loop())

async def game_loop():
    conf = db["config"]; tick = 0.1
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
            if len(alive) > p["strat"]["camp_until"]:
                closest = min(enemies, key=lambda e: math.hypot(e["x"]-p["x"], e["y"]-p["y"]))
                ang = math.atan2(closest["y"]-p["y"], closest["x"]-p["x"])
                p["x"] -= math.cos(ang) * (p["speed"]*1.2) * tick; p["y"] -= math.sin(ang) * (p["speed"]*1.2) * tick
            else:
                rule = p["strat"]["target_rule"]
                if rule == "lowest_hp": target = min(enemies, key=lambda e: e["hp"])
                elif rule == "highest_hp": target = max(enemies, key=lambda e: e["hp"])
                elif rule == "counter":
                    cnts = [e for e in enemies if e["shield"] in SYNERGY.get(p["weapon"], [])]
                    target = min(cnts, key=lambda e: math.hypot(e["x"]-p["x"], e["y"]-p["y"])) if cnts else min(enemies, key=lambda e: math.hypot(e["x"]-p["x"], e["y"]-p["y"]))
                else: target = min(enemies, key=lambda e: math.hypot(e["x"]-p["x"], e["y"]-p["y"]))
                dist = math.hypot(target["x"]-p["x"], target["y"]-p["y"])
                if dist > p["range"]:
                    ang = math.atan2(target["y"]-p["y"], target["x"]-p["x"])
                    p["x"] += math.cos(ang) * p["speed"] * tick; p["y"] += math.sin(ang) * p["speed"] * tick
                elif p["cd"] <= 0:
                    mult = 1.5 if target["shield"] in SYNERGY.get(p["weapon"], []) else 1.0
                    target["hp"] -= int(p["dmg"] * mult); p["cd"] = p["max_cd"]
                    game_state["particles"].append({"x1": p["x"], "y1": p["y"], "x2": target["x"], "y2": target["y"], "c": p["color"]})
                    if target["hp"] <= 0: game_state["logs"].append(f"💀 {p['name']} hạ gục {target['name']}!")
            p["x"] = max(25, min(conf["w"]-25, p["x"])); p["y"] = max(25, min(conf["h"]-25, p["y"]))
        await broadcast_state(); await asyncio.sleep(tick)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept(); active_connections.append(websocket)
    try:
        await websocket.send_text(json.dumps(game_state))
        while True: await websocket.receive_text()
    except:
        if websocket in active_connections: active_connections.remove(websocket)