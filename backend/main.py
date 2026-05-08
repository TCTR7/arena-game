from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import random, json, os, asyncio, math

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

DB_FILE = "game_data.json"

def load_data():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r") as f: return json.load(f)
        except: pass
    return {"players": [], "config": {"title": "ĐẤU TRƯỜNG DEV", "bg": "#0f172a", "w": 800, "h": 600}}

def save_data(data):
    with open(DB_FILE, "w") as f: json.dump(data, f, indent=4)

db = load_data()
ready_init = [p for p in db.get("players", []) if p.get("strategy") is not None]

game_state = {
    "status": "waiting", "players": [], "particles": [], 
    "logs": ["🎙️ Server đã khôi phục dữ liệu!"], 
    "winner_info": None, "ready_count": len(ready_init), "timer": 0, "config": db["config"]
}
active_connections = []

class PlayerReg(BaseModel): name: str; weapon: str; shield: str
class PlayerStrategy(BaseModel): name: str; target_rule: str; camp_until: int
class ConfigModel(BaseModel): title: str; bg: str; w: int; h: int

# HỆ THỐNG CHỈ SỐ MỚI (CÂN BẰNG TRỌNG LƯỢNG)
W_MAP = {
    "dagger": {"icon": "🗡️", "color": "gray", "rng": 35, "dmg": 15, "cd": 0.5, "wt": 2},
    "sword":  {"icon": "🤺", "color": "red", "rng": 50, "dmg": 25, "cd": 1.0, "wt": 10},
    "spear":  {"icon": "🔱", "color": "yellow", "rng": 90, "dmg": 22, "cd": 1.2, "wt": 15},
    "bow":    {"icon": "🏹", "color": "green", "rng": 250, "dmg": 18, "cd": 0.8, "wt": 5},
    "magic":  {"icon": "🪄", "color": "blue", "rng": 170, "dmg": 35, "cd": 1.5, "wt": 5},
    "hammer": {"icon": "🔨", "color": "orange", "rng": 45, "dmg": 45, "cd": 2.0, "wt": 30}
}
S_MAP = {
    "buckler":      {"icon": "🥏", "wt": 3},
    "magic_ward":   {"icon": "🔮", "wt": 5},
    "wood_shield":  {"icon": "🪵", "wt": 10},
    "steel_shield": {"icon": "🛡️", "wt": 20},
    "tower_shield": {"icon": "🧱", "wt": 35}
}
SYNERGY = {
    "dagger": {"magic_ward": 1.5, "wood_shield": 1.5},
    "sword":  {"wood_shield": 1.5, "buckler": 1.5},
    "spear":  {"steel_shield": 1.5, "wood_shield": 1.5},
    "bow":    {"magic_ward": 1.5, "buckler": 1.5},
    "magic":  {"steel_shield": 1.5, "tower_shield": 1.5},
    "hammer": {"tower_shield": 1.5, "steel_shield": 1.5}
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
    db["config"] = c.dict(); save_data(db); await broadcast_state()
    return {"status": "success"}

@app.post("/register")
async def register_player(data: PlayerReg):
    if any(p["name"] == data.name for p in db["players"]): return {"status": "error", "message": "Tên đã tồn tại!"}
    db["players"].append({"name": data.name, "weapon": data.weapon, "shield": data.shield, "strategy": None})
    save_data(db); await broadcast_state()
    return {"status": "success"}

@app.delete("/player/{name}")
async def delete_player(name: str):
    db["players"] = [p for p in db["players"] if p["name"] != name]
    save_data(db); await broadcast_state()
    return {"status": "success"}

@app.get("/lobby")
def get_lobby(): return db["players"]

@app.post("/phase-strategy")
async def to_strategy_phase():
    game_state["status"] = "strategy"
    await broadcast_state()
    asyncio.create_task(strategy_countdown())
    return {"status": "success"}

async def strategy_countdown():
    game_state["timer"] = 45
    while game_state["status"] == "strategy" and game_state["timer"] > 0:
        if len([p for p in db["players"] if p["strategy"]]) >= len(db["players"]) and len(db["players"]) >= 2: break
        await asyncio.sleep(1); game_state["timer"] -= 1; await broadcast_state()
    if game_state["status"] == "strategy":
        for p in db["players"]:
            if not p["strategy"]: p["strategy"] = {"target_rule": "closest", "camp_until": 99}
        save_data(db); await auto_start_countdown()

@app.post("/update-strategy")
async def update_strategy(data: PlayerStrategy):
    for p in db["players"]:
        if p["name"] == data.name:
            p["strategy"] = data.dict()
            save_data(db); break
    ready = [p for p in db["players"] if p["strategy"] is not None]
    game_state["ready_count"] = len(ready)
    await broadcast_state(); return {"status": "success"}

async def auto_start_countdown():
    for i in range(3, 0, -1):
        game_state["logs"] = [f"🎙️ KHAI CHIẾN SAU {i}..."]
        await broadcast_state(); await asyncio.sleep(1)
    await start_game_logic()

async def start_game_logic():
    conf = db["config"]
    game_players = []
    for p in db["players"]:
        w = W_MAP[p["weapon"]]
        s = S_MAP[p["shield"]]
        # TÍNH TOÁN TỐC ĐỘ DỰA TRÊN TRỌNG LƯỢNG (Base 90)
        total_weight = w["wt"] + s["wt"]
        actual_speed = max(20, 90 - total_weight)
        
        game_players.append({
            "name": p["name"], "weapon": p["weapon"], "shield": p["shield"], 
            "icon": w["icon"], "s_icon": s["icon"], "color": w["color"],
            "x": random.randint(50, conf["w"]-50), "y": random.randint(50, conf["h"]-50),
            "hp": 100, "max_hp": 100, "range": w["rng"], "speed": actual_speed, 
            "base_dmg": w["dmg"], "cooldown": 0, "max_cooldown": w["cd"] * 10, "strategy": p["strategy"]
        })
    game_state["status"] = "playing"; game_state["players"] = game_players; await broadcast_state()
    asyncio.create_task(game_loop())

@app.post("/reset")
async def reset_game():
    db["players"] = []; save_data(db)
    game_state.update({"status": "waiting", "players": [], "winner_info": None, "logs": [], "timer": 0, "ready_count": 0})
    await broadcast_state(); return {"status": "success"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept(); active_connections.append(websocket)
    try:
        await websocket.send_text(json.dumps(game_state))
        while True: await websocket.receive_text()
    except:
        if websocket in active_connections: active_connections.remove(websocket)

async def game_loop():
    conf = db["config"]; tick = 0.1
    while game_state["status"] == "playing":
        players = game_state["players"]; alive = [p for p in players if p["hp"] > 0]
        if len(alive) <= 1:
            game_state["status"] = "finished"
            if alive: game_state["winner_info"] = alive[0]
            await broadcast_state(); break
        game_state["particles"] = []
        for p in alive:
            if p["cooldown"] > 0: p["cooldown"] -= 1
            enemies = [e for e in alive if e["name"] != p["name"]]
            if not enemies: continue
            
            if len(alive) > p["strategy"]["camp_until"]:
                closest = min(enemies, key=lambda e: math.hypot(e["x"]-p["x"], e["y"]-p["y"]))
                ang = math.atan2(closest["y"]-p["y"], closest["x"]-p["x"])
                p["x"] -= math.cos(ang) * (p["speed"]*0.8) * tick; p["y"] -= math.sin(ang) * (p["speed"]*0.8) * tick
            else:
                rule = p["strategy"]["target_rule"]
                if rule == "lowest_hp": target = min(enemies, key=lambda e: e["hp"])
                elif rule == "highest_hp": target = max(enemies, key=lambda e: e["hp"])
                elif rule == "furthest": target = max(enemies, key=lambda e: math.hypot(e["x"]-p["x"], e["y"]-p["y"]))
                elif rule == "counter":
                    cnts = [e for e in enemies if SYNERGY.get(p["weapon"], {}).get(e["shield"], 1.0) > 1.0]
                    target = min(cnts, key=lambda e: math.hypot(e["x"]-p["x"], e["y"]-p["y"])) if cnts else min(enemies, key=lambda e: math.hypot(e["x"]-p["x"], e["y"]-p["y"]))
                else: target = min(enemies, key=lambda e: math.hypot(e["x"]-p["x"], e["y"]-p["y"]))
                
                dist = math.hypot(target["x"]-p["x"], target["y"]-p["y"])
                if dist > p["range"]:
                    ang = math.atan2(target["y"]-p["y"], target["x"]-p["x"])
                    p["x"] += math.cos(ang) * p["speed"] * tick; p["y"] += math.sin(ang) * p["speed"] * tick
                elif p["cooldown"] <= 0:
                    mult = SYNERGY.get(p["weapon"], {}).get(target["shield"], 1.0)
                    target["hp"] -= int(p["base_dmg"] * mult)
                    p["cooldown"] = p["max_cooldown"]
                    game_state["particles"].append({"x1": p["x"], "y1": p["y"], "x2": target["x"], "y2": target["y"], "c": p["color"]})
            p["x"] = max(20, min(conf["w"]-20, p["x"])); p["y"] = max(20, min(conf["h"]-20, p["y"]))
        await broadcast_state(); await asyncio.sleep(tick)