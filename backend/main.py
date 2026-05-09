import asyncio
import json
import math
import random
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === CONSTANTS & STATS ===
WEAPONS = {
    "dagger": {"name": "Dao găm", "min_rng": 40, "max_rng": 120, "dmg": 14, "cd_ticks": 4, "weight": 0, "counters": "wood_shield"},
    "sword": {"name": "Kiếm dài", "min_rng": 0, "max_rng": 50, "dmg": 25, "cd_ticks": 10, "weight": 15, "counters": ["wood_shield", "buckler"]},
    "spear": {"name": "Trường giáo", "min_rng": 35, "max_rng": 90, "dmg": 22, "cd_ticks": 12, "weight": 20, "counters":["steel_shield", "buckler"]},
    "bow": {"name": "Cung tiễn", "min_rng": 80, "max_rng": 220, "dmg": 18, "cd_ticks": 8, "weight": 10, "counters":["buckler", "wood_shield"]},
    "hammer": {"name": "Búa tạ", "min_rng": 0, "max_rng": 45, "dmg": 65, "cd_ticks": 22, "weight": 40, "counters": "steel_shield"}
}

SHIELDS = {
    "buckler": {"name": "Khiên nhỏ", "weight": 2, "block": 0.05},
    "wood_shield": {"name": "Khiên gỗ", "weight": 20, "block": 0.35},
    "steel_shield": {"name": "Khiên thép", "weight": 60, "block": 0.65}
}

DATA_DIR = "/app/data"
os.makedirs(DATA_DIR, exist_ok=True)
CONFIG_FILE = os.path.join(DATA_DIR, "game_config.json")
DATA_FILE = os.path.join(DATA_DIR, "game_data.json")

# === STATE MANAGEMENT ===
class GameState:
    def __init__(self):
        self.phase = "waiting" # waiting, strategy, playing, finished
        self.config = {"room_name": "Giải Đấu Cờ Nhân Phẩm", "map_width": 2000, "map_height": 2000, "bg_color": "#052e16", "language": "vi"}
        self.players = {}
        self.logs =[]
        self.events = [] # For SFX (transient)
        self.projectiles =[]
        self.ticks = 0
        self.phase2_timer = 180
        
        # Red Zone
        self.zone_target_radius = 2000
        self.zone_current_radius = 2000
        self.zone_x = 1000
        self.zone_y = 1000

        self.load_config()
        self.load_data()

    def load_config(self):
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    self.config.update(json.load(f))
            except: pass

    def save_config(self):
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(self.config, f, ensure_ascii=False, indent=4)

    def load_data(self):
        if os.path.exists(DATA_FILE):
            try:
                with open(DATA_FILE, "r", encoding="utf-8") as f:
                    self.players = json.load(f)
            except: pass

    def save_data(self):
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(self.players, f, ensure_ascii=False, indent=4)

    def add_log(self, msg_vi, msg_en):
        msg = msg_vi if self.config["language"] == "vi" else msg_en
        self.logs.insert(0, msg)
        if len(self.logs) > 30: self.logs.pop()

game_state = GameState()
active_connections: List[WebSocket] =[]

# === MODELS ===
class ConfigReq(BaseModel):
    room_name: str
    map_width: int
    map_height: int
    bg_color: str
    language: str

class RegisterReq(BaseModel):
    name: str
    pwd: str
    weapon: str
    shield: str

class StrategyReq(BaseModel):
    name: str
    pwd: str
    target_rule: str
    camp_rule: str

# === API ENDPOINTS ===
@app.post("/api/config")
def save_config(req: ConfigReq):
    game_state.config.update(req.dict())
    game_state.save_config()
    return {"status": "ok"}

@app.post("/api/register")
def register_player(req: RegisterReq):
    if req.name in game_state.players and game_state.players[req.name]["pwd"] != req.pwd:
        return {"error": "Sai mật khẩu"}
    
    # Random sẵn AI ban đầu. Nếu người chơi không kịp lưu Phase 2 thì sẽ dùng AI ngẫu nhiên này.
    game_state.players[req.name] = {
        "name": req.name, "pwd": req.pwd,
        "weapon": req.weapon, "shield": req.shield,
        "target_rule": random.choice(["nearest", "lowest_hp", "tankiest", "counter"]),
        "camp_rule": random.choice(["attack", "top5", "top3", "top2"]),
        "hp": 500, "max_hp": 500, "alive": True,
        "x": random.randint(100, game_state.config["map_width"] - 100),
        "y": random.randint(100, game_state.config["map_height"] - 100),
        "cooldown": 0, "wander_angle": random.uniform(0, math.pi*2)
    }
    game_state.save_data()
    return {"status": "ok"}

@app.post("/api/strategy")
def set_strategy(req: StrategyReq):
    if req.name in game_state.players and game_state.players[req.name]["pwd"] == req.pwd:
        game_state.players[req.name]["target_rule"] = req.target_rule
        game_state.players[req.name]["camp_rule"] = req.camp_rule
        game_state.save_data()
        return {"status": "ok"}
    return {"error": "Sai thông tin"}

@app.post("/api/bots")
def add_bots():
    names =["Yasuo", "Yone", "Garen", "Darius", "Ahri", "Zed", "Akali", "Teemo", "Vayne", "LeeSin"]
    for name in names:
        bot_name = f"Bot_{name}_{random.randint(1000,9999)}"
        game_state.players[bot_name] = {
            "name": bot_name, "pwd": "bot",
            "weapon": random.choice(list(WEAPONS.keys())),
            "shield": random.choice(list(SHIELDS.keys())),
            "target_rule": random.choice(["nearest", "lowest_hp", "tankiest", "counter"]),
            "camp_rule": random.choice(["attack", "top5", "top3", "top2"]),
            "hp": 500, "max_hp": 500, "alive": True,
            "x": random.randint(100, game_state.config["map_width"] - 100),
            "y": random.randint(100, game_state.config["map_height"] - 100),
            "cooldown": 0, "wander_angle": random.uniform(0, math.pi*2)
        }
    game_state.save_data()
    return {"status": "ok"}

@app.post("/api/phase/{phase}")
def set_phase(phase: str):
    game_state.phase = phase
    if phase == "strategy":
        game_state.phase2_timer = 180
    elif phase == "playing":
        game_state.logs =[]
        game_state.add_log("Trận chiến sinh tồn bắt đầu!", "Battle Royale started!")
        game_state.projectiles =[]
        game_state.ticks = 0
        w, h = game_state.config["map_width"], game_state.config["map_height"]
        game_state.zone_x = w / 2
        game_state.zone_y = h / 2
        game_state.zone_target_radius = math.hypot(w, h) / 2
        game_state.zone_current_radius = game_state.zone_target_radius
        for p in game_state.players.values():
            p["hp"] = p["max_hp"]
            p["alive"] = True
            p["x"] = random.randint(100, w - 100)
            p["y"] = random.randint(100, h - 100)
            p["cooldown"] = 0
    elif phase == "waiting":
        game_state.players = {}
        game_state.save_data()
    return {"status": "ok"}

# === WEBSOCKET & ENGINE LOOP ===
async def broadcast():
    if not active_connections: return
    data = {
        "phase": game_state.phase,
        "config": game_state.config,
        "players": game_state.players,
        "logs": game_state.logs,
        "events": game_state.events,
        "projectiles": game_state.projectiles,
        "timer": game_state.phase2_timer,
        "zone": {"x": game_state.zone_x, "y": game_state.zone_y, "r": game_state.zone_current_radius}
    }
    msg = json.dumps(data)
    for conn in active_connections:
        try: await conn.send_text(msg)
        except: pass
    game_state.events.clear() # Clear transient events

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        active_connections.remove(websocket)

def calc_dist(x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    dist = math.hypot(dx, dy)
    if dist < 0.001: return 1.0, 1.0, 1.414
    return dx, dy, dist

def is_counter(weap, shield):
    counters = WEAPONS[weap]["counters"]
    if isinstance(counters, list): return shield in counters
    return shield == counters

def update_game_logic():
    game_state.ticks += 1
    
    if game_state.phase == "strategy" and game_state.ticks % 10 == 0:
        game_state.phase2_timer -= 1
        if game_state.phase2_timer <= 0:
            set_phase("playing")
        return

    if game_state.phase != "playing": return

    w_map = game_state.config["map_width"]
    h_map = game_state.config["map_height"]

    # --- ZONE LOGIC ---
    if game_state.ticks % 200 == 0: # Every 20s (200 ticks)
        game_state.zone_target_radius = max(50, game_state.zone_target_radius - 120)
        game_state.add_log("⚠️ Vòng bo đang thu hẹp!", "⚠️ The Red Zone is shrinking!")

    if game_state.zone_current_radius > game_state.zone_target_radius:
        game_state.zone_current_radius -= 2.0 # Smooth shrink

    # Process projectiles
    new_projs = []
    for proj in game_state.projectiles:
        proj["life"] -= 1
        proj["x"] += proj["vx"]
        proj["y"] += proj["vy"]
        if proj["life"] > 0: new_projs.append(proj)
    game_state.projectiles = new_projs

    alive_players =[p for p in game_state.players.values() if p["alive"]]
    alive_count = len(alive_players)

    if alive_count <= 1:
        if alive_count == 1:
            winner = alive_players[0]
            game_state.add_log(f"🏆 {winner['name']} vô địch Battle Royale!", f"🏆 {winner['name']} won the Battle Royale!")
            game_state.events.append({"type": "win"})
        game_state.phase = "finished"
        return

    # BOIDS - Anti-clumping
    repulsion = {p["name"]:[0.0, 0.0] for p in alive_players}
    for i in range(len(alive_players)):
        for j in range(i+1, len(alive_players)):
            p1, p2 = alive_players[i], alive_players[j]
            dx, dy, dist = calc_dist(p1["x"], p1["y"], p2["x"], p2["y"])
            if dist < 25:
                force = (25 - dist) / 5
                repulsion[p1["name"]][0] -= (dx/dist) * force
                repulsion[p1["name"]][1] -= (dy/dist) * force
                repulsion[p2["name"]][0] += (dx/dist) * force
                repulsion[p2["name"]][1] += (dy/dist) * force

    for p in alive_players:
        if p["cooldown"] > 0: p["cooldown"] -= 1

        w_data = WEAPONS[p["weapon"]]
        s_data = SHIELDS[p["shield"]]
        
        # Speed calc: max(30, 180 - w - w) * dt(0.05)
        base_speed = max(30, 180 - w_data["weight"] - s_data["weight"]) * 0.05

        # Zone damage & logic
        _, _, dist_to_zone = calc_dist(p["x"], p["y"], game_state.zone_x, game_state.zone_y)
        outside_zone = dist_to_zone > game_state.zone_current_radius
        if outside_zone:
            p["hp"] -= 0.8 # -0.8 HP/tick

        if p["hp"] <= 0:
            p["hp"] = 0
            p["alive"] = False
            game_state.add_log(f"☠️ {p['name']} chết ngoài vòng bo!", f"☠️ {p['name']} died in the red zone!")
            game_state.events.append({"type": "death"})
            continue

        # Berserk
        is_berserk = p["hp"] < 150

        # Camp rule logic
        is_camping = False
        if not is_berserk:
            c = p["camp_rule"]
            if c == "top5" and alive_count > 5: is_camping = True
            if c == "top3" and alive_count > 3: is_camping = True
            if c == "top2" and alive_count > 2: is_camping = True

        vx, vy = repulsion[p["name"]][0], repulsion[p["name"]][1]

        # PRIORITY 1: RUN TO ZONE
        if outside_zone:
            zx, zy, zdist = calc_dist(p["x"], p["y"], game_state.zone_x, game_state.zone_y)
            vx += (zx/zdist) * base_speed * 1.5
        else:
            # PRIORITY 2: COMBAT/FLEE/WANDER
            enemies =[e for e in alive_players if e["name"] != p["name"]]
            target = None
            if p["target_rule"] == "lowest_hp": target = min(enemies, key=lambda e: e["hp"])
            elif p["target_rule"] == "tankiest": target = max(enemies, key=lambda e: e["hp"])
            elif p["target_rule"] == "counter":
                counters =[e for e in enemies if is_counter(p["weapon"], e["shield"])]
                target = min(counters, key=lambda e: calc_dist(p["x"], p["y"], e["x"], e["y"])[2]) if counters else min(enemies, key=lambda e: calc_dist(p["x"], p["y"], e["x"], e["y"])[2])
            else:
                target = min(enemies, key=lambda e: calc_dist(p["x"], p["y"], e["x"], e["y"])[2])

            dx, dy, dist = calc_dist(p["x"], p["y"], target["x"], target["y"])

            if is_camping:
                if dist < 150: # Enemy close -> Flee
                    vx -= (dx/dist) * base_speed
                else: # Safe -> Wander
                    p["wander_angle"] += random.uniform(-0.3, 0.3)
                    vx += math.cos(p["wander_angle"]) * (base_speed * 0.5)
                    vy += math.sin(p["wander_angle"]) * (base_speed * 0.5)
            else: # Attacking
                if dist > w_data["max_rng"]:
                    # Approach
                    dir_x, dir_y = dx/dist, dy/dist
                    if p["weapon"] == "dagger": # Zig-zag
                        orth_x, orth_y = -dir_y, dir_x
                        zig = math.sin(game_state.ticks * 0.3) * 2.0
                        vx += (dir_x + orth_x * zig) * base_speed
                    else:
                        vx += dir_x * base_speed
                elif dist < w_data["min_rng"]:
                    # Retreat (Hit and Run)
                    vx -= (dx/dist) * base_speed

            # Attack logic
            if w_data["min_rng"] <= dist <= w_data["max_rng"]:
                if p["cooldown"] <= 0:
                    t_shield_data = SHIELDS[target["shield"]]
                    base_dmg = w_data["dmg"]
                    
                    # Exception: Bow vs Steel
                    if p["weapon"] == "bow" and target["shield"] == "steel_shield":
                        base_dmg /= 2.0

                    # Counter multiplier
                    multiplier = 2.0 if is_counter(p["weapon"], target["shield"]) else 1.0
                    
                    # Block reduction
                    final_dmg = (base_dmg * multiplier) * (1.0 - t_shield_data["block"])
                    target["hp"] -= final_dmg
                    p["cooldown"] = w_data["cd_ticks"]

                    # SFX & Visuals
                    game_state.events.append({"type": "attack", "weapon": p["weapon"]})
                    
                    # Projectile Gen
                    if p["weapon"] in ["bow", "dagger", "spear"]:
                        game_state.projectiles.append({
                            "x": p["x"], "y": p["y"],
                            "vx": (dx/dist) * 15, "vy": (dy/dist) * 15,
                            "life": int(dist/15), "type": p["weapon"]
                        })
                    else: # Melee line
                        game_state.projectiles.append({
                            "x": p["x"], "y": p["y"], "vx": 0, "vy": 0,
                            "tx": target["x"], "ty": target["y"],
                            "life": 3, "type": "melee"
                        })

                    # Knockback
                    if p["weapon"] in ["sword", "hammer"]:
                        kb = 15 if p["weapon"] == "sword" else 30
                        target["x"] += (dx/dist) * kb
                        target["y"] += (dy/dist) * kb

                    if multiplier == 2.0:
                        game_state.add_log(f"💥 {p['name']} khắc hệ, đâm {int(final_dmg)} HP vào {target['name']}!", 
                                           f"💥 {p['name']} counters, deals {int(final_dmg)} dmg to {target['name']}!")
                    
                    if target["hp"] <= 0:
                        target["hp"] = 0
                        target["alive"] = False
                        game_state.events.append({"type": "death"})
                        game_state.add_log(f"💀 {p['name']} đã kết liễu {target['name']}!", 
                                           f"💀 {p['name']} killed {target['name']}!")

        # Apply movement with bounds bouncing
        p["x"] += vx
        p["y"] += vy
        
        if p["x"] < 20: p["x"] = 20; p["wander_angle"] = math.pi - p["wander_angle"]
        elif p["x"] > w_map - 20: p["x"] = w_map - 20; p["wander_angle"] = math.pi - p["wander_angle"]
        
        if p["y"] < 20: p["y"] = 20; p["wander_angle"] = -p["wander_angle"]
        elif p["y"] > h_map - 20: p["y"] = h_map - 20; p["wander_angle"] = -p["wander_angle"]

async def game_loop():
    while True:
        update_game_logic()
        await broadcast()
        await asyncio.sleep(0.1) # 10 ticks/s

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(game_loop())