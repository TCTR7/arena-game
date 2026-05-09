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

DATA_DIR = "/app/data"
os.makedirs(DATA_DIR, exist_ok=True)
CONFIG_FILE = os.path.join(DATA_DIR, "game_config.json")
DATA_FILE = os.path.join(DATA_DIR, "game_data.json")

class GameState:
    def __init__(self):
        self.phase = "waiting"
        self.config = {
            "room_name": "Giải Đấu Cờ Nhân Phẩm", 
            "map_width": 2000, 
            "map_height": 2000, 
            "bg_color": "#052e16", 
            "language": "vi",
            "character_settings": {
                "base_hp": 500,
                "card_width": 100,
                "card_height": 110
            },
            "weapons": {
                "dagger": {"n": "Dao găm", "e": "🗡️", "min_rng": 50, "max_rng": 160, "r": "50-160", "dmg": 14, "cd_ticks": 4, "cd": "0.4s", "weight": 0, "counters": "wood_shield", "crit": 0.30, "crit_mult": 2.0},
                "sword": {"n": "Kiếm dài", "e": "⚔️", "min_rng": 0, "max_rng": 110, "r": "0-110", "dmg": 25, "cd_ticks": 10, "cd": "1.0s", "weight": 15, "counters":["wood_shield", "buckler"], "crit": 0.15, "crit_mult": 1.5},
                "spear": {"n": "Trường giáo", "e": "🔱", "min_rng": 50, "max_rng": 140, "r": "50-140", "dmg": 22, "cd_ticks": 12, "cd": "1.2s", "weight": 20, "counters":["steel_shield", "buckler"], "crit": 0.10, "crit_mult": 1.5},
                "bow": {"n": "Cung tiễn", "e": "🏹", "min_rng": 100, "max_rng": 300, "r": "100-300", "dmg": 18, "cd_ticks": 8, "cd": "0.8s", "weight": 10, "counters":["buckler", "wood_shield"], "crit": 0.15, "crit_mult": 1.5},
                "hammer": {"n": "Búa tạ", "e": "🔨", "min_rng": 0, "max_rng": 100, "r": "0-100", "dmg": 65, "cd_ticks": 22, "cd": "2.2s", "weight": 40, "counters": "steel_shield", "crit": 0.0, "crit_mult": 1.0}
            },
            "shields": {
                "buckler": {"n": "Khiên nhỏ", "e": "🥏", "weight": 2, "block": 0.05, "b": "5%", "dodge": 0.25},
                "wood_shield": {"n": "Khiên gỗ", "e": "🪵", "weight": 20, "block": 0.35, "b": "35%", "dodge": 0.05},
                "steel_shield": {"n": "Khiên thép", "e": "🛡️", "weight": 60, "block": 0.65, "b": "65%", "dodge": 0.0}
            }
        }
        
        self.players = {}
        self.logs =[]
        self.events =[]
        self.projectiles =[]
        self.bushes =[]
        self.airdrops =[]
        
        self.ticks = 0
        self.phase2_timer = 180
        self.reveal_timer = 25 
        
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
        else:
            self.save_config()

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

class ForceEndReq(BaseModel):
    pwd: str

@app.post("/api/config")
def save_config(req: ConfigReq):
    game_state.config.update(req.dict())
    game_state.save_config()
    return {"status": "ok"}

@app.post("/api/register")
def register_player(req: RegisterReq):
    if req.name in game_state.players and game_state.players[req.name]["pwd"] != req.pwd:
        return {"error": "Sai mật khẩu"}
    
    base_hp = game_state.config["character_settings"]["base_hp"]
    game_state.players[req.name] = {
        "name": req.name, "pwd": req.pwd,
        "weapon": req.weapon, "shield": req.shield,
        "target_rule": random.choice(["nearest", "lowest_hp", "tankiest", "counter"]),
        "camp_rule": random.choice(["attack", "top5", "top3", "top2"]),
        "hp": base_hp, "max_hp": base_hp, "alive": True,
        "x": random.randint(100, game_state.config["map_width"] - 100),
        "y": random.randint(100, game_state.config["map_height"] - 100),
        "cooldown": 0, "wander_angle": random.uniform(0, math.pi*2),
        "in_bush": False
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
    base_hp = game_state.config["character_settings"]["base_hp"]
    for name in names:
        bot_name = f"Bot_{name}_{random.randint(1000,9999)}"
        game_state.players[bot_name] = {
            "name": bot_name, "pwd": "bot",
            "weapon": random.choice(list(game_state.config["weapons"].keys())),
            "shield": random.choice(list(game_state.config["shields"].keys())),
            "target_rule": random.choice(["nearest", "lowest_hp", "tankiest", "counter"]),
            "camp_rule": random.choice(["attack", "top5", "top3", "top2"]),
            "hp": base_hp, "max_hp": base_hp, "alive": True,
            "x": random.randint(100, game_state.config["map_width"] - 100),
            "y": random.randint(100, game_state.config["map_height"] - 100),
            "cooldown": 0, "wander_angle": random.uniform(0, math.pi*2),
            "in_bush": False
        }
    game_state.save_data()
    return {"status": "ok"}

@app.post("/api/clear_players")
def clear_players():
    game_state.players = {}
    game_state.save_data()
    return {"status": "ok"}

@app.post("/api/phase/{phase}")
def set_phase(phase: str):
    game_state.phase = phase
    if phase == "strategy":
        game_state.phase2_timer = 180
    elif phase == "reveal":
        game_state.reveal_timer = 25
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
        
        game_state.bushes =[{"x": random.randint(200, w-200), "y": random.randint(200, h-200), "r": random.randint(120, 180)} for _ in range(8)]
        game_state.airdrops =[]

        base_hp = game_state.config["character_settings"]["base_hp"]
        for p in game_state.players.values():
            p["max_hp"] = base_hp 
            p["hp"] = base_hp
            p["alive"] = True
            p["x"] = random.randint(100, w - 100)
            p["y"] = random.randint(100, h - 100)
            p["cooldown"] = 0
            p["in_bush"] = False
    elif phase == "waiting":
        game_state.load_config()
        game_state.save_data()
    return {"status": "ok"}

@app.post("/api/force_end")
def force_end_game(req: ForceEndReq):
    if req.pwd != "dev123":
        return {"error": "Sai mật khẩu Host!"}
    
    if game_state.phase == "playing":
        alive_players =[p for p in game_state.players.values() if p["alive"]]
        if alive_players:
            alive_players.sort(key=lambda x: x["hp"], reverse=True)
            winner = alive_players[0]
            for p in alive_players[1:]:
                p["hp"] = 0
                p["alive"] = False
            game_state.add_log(f"🛑 HOST kết thúc sớm! {winner['name']} thắng nhờ có nhiều máu nhất!", 
                               f"🛑 HOST forced end! {winner['name']} wins by highest HP!")
            game_state.events.append({"type": "win"})
        game_state.phase = "finished"
    return {"status": "ok"}

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
        "reveal_timer": game_state.reveal_timer,
        "zone": {"x": game_state.zone_x, "y": game_state.zone_y, "r": game_state.zone_current_radius},
        "bushes": game_state.bushes,
        "airdrops": game_state.airdrops
    }
    msg = json.dumps(data)
    for conn in active_connections:
        try: await conn.send_text(msg)
        except: pass
    game_state.events.clear()

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

def is_counter(weap, shield, weapons_dict):
    counters = weapons_dict[weap]["counters"]
    if isinstance(counters, list): return shield in counters
    return shield == counters

def update_game_logic():
    game_state.ticks += 1
    
    if game_state.phase == "strategy" and game_state.ticks % 10 == 0:
        game_state.phase2_timer -= 1
        if game_state.phase2_timer <= 0:
            set_phase("reveal")
        return

    if game_state.phase == "reveal" and game_state.ticks % 10 == 0:
        game_state.reveal_timer -= 1
        if game_state.reveal_timer <= 0:
            set_phase("playing") 
        return

    if game_state.phase != "playing": return

    w_map = game_state.config["map_width"]
    h_map = game_state.config["map_height"]
    weapons_dict = game_state.config["weapons"]
    shields_dict = game_state.config["shields"]
    card_w = game_state.config["character_settings"]["card_width"]
    boid_radius = card_w * 0.45 

    if game_state.ticks % 100 == 0:
        game_state.zone_target_radius = max(50, game_state.zone_target_radius - 75)
        game_state.add_log("⚠️ Vòng bo đang thu hẹp!", "⚠️ The Red Zone is shrinking!")

    if game_state.zone_current_radius > game_state.zone_target_radius:
        game_state.zone_current_radius -= 2.0

    if game_state.ticks % 150 == 0 and len(game_state.airdrops) < 5:
        drop_x = game_state.zone_x + random.randint(-int(game_state.zone_current_radius/2), int(game_state.zone_current_radius/2))
        drop_y = game_state.zone_y + random.randint(-int(game_state.zone_current_radius/2), int(game_state.zone_current_radius/2))
        game_state.airdrops.append({"x": drop_x, "y": drop_y})
        game_state.add_log("🎁 Một Hộp Cứu Thương đã rơi xuống đấu trường!", "🎁 An Airdrop has landed!")

    new_projs =[]
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

    repulsion = {p["name"]:[0.0, 0.0] for p in alive_players}
    for i in range(len(alive_players)):
        for j in range(i+1, len(alive_players)):
            p1, p2 = alive_players[i], alive_players[j]
            dx, dy, dist = calc_dist(p1["x"], p1["y"], p2["x"], p2["y"])
            if dist < boid_radius:
                force = (boid_radius - dist) / 5
                repulsion[p1["name"]][0] -= (dx/dist) * force
                repulsion[p1["name"]][1] -= (dy/dist) * force
                repulsion[p2["name"]][0] += (dx/dist) * force
                repulsion[p2["name"]][1] += (dy/dist) * force

    for p in alive_players:
        if p["cooldown"] > 0: p["cooldown"] -= 1

        w_data = weapons_dict[p["weapon"]]
        s_data = shields_dict[p["shield"]]
        base_speed = max(30, 180 - w_data["weight"] - s_data["weight"]) * 0.05

        p["in_bush"] = any(calc_dist(p["x"], p["y"], b["x"], b["y"])[2] < b["r"] for b in game_state.bushes)

        # Xử lý nhặt Airdrop khi đứng gần
        new_airdrops =[]
        healed = False
        for drop in game_state.airdrops:
            if not healed and calc_dist(p["x"], p["y"], drop["x"], drop["y"])[2] < 40:
                p["hp"] = min(p["max_hp"], p["hp"] + 150)
                game_state.events.append({"type": "heal", "x": p["x"], "y": p["y"], "text": "+150 HP"})
                game_state.add_log(f"💉 {p['name']} đã nhặt được Hộp Cứu Thương!", f"💉 {p['name']} looted a Health Pack!")
                healed = True
            else:
                new_airdrops.append(drop)
        game_state.airdrops = new_airdrops

        _, _, dist_to_zone = calc_dist(p["x"], p["y"], game_state.zone_x, game_state.zone_y)
        outside_zone = dist_to_zone > game_state.zone_current_radius
        if outside_zone: p["hp"] -= 0.8 

        if p["hp"] <= 0:
            p["hp"] = 0
            p["alive"] = False
            game_state.add_log(f"☠️ {p['name']} gục ngã ngoài vòng bo!", f"☠️ {p['name']} died in the red zone!")
            game_state.events.append({"type": "death"})
            continue

        is_berserk = p["hp"] < (p["max_hp"] * 0.3)
        is_camping = False
        if not is_berserk:
            c = p["camp_rule"]
            if c == "top5" and alive_count > 5: is_camping = True
            if c == "top3" and alive_count > 3: is_camping = True
            if c == "top2" and alive_count > 2: is_camping = True

        enemies =[e for e in alive_players if e["name"] != p["name"] and (not e["in_bush"] or calc_dist(p["x"], p["y"], e["x"], e["y"])[2] < 60)]
        min_enemy_hp = min((e["hp"] for e in enemies), default=0)
        nearest_enemy = min(enemies, key=lambda e: calc_dist(p["x"], p["y"], e["x"], e["y"])[2]) if enemies else None
        
        target = None
        if enemies:
            if p["target_rule"] == "lowest_hp": target = min(enemies, key=lambda e: e["hp"])
            elif p["target_rule"] == "tankiest": target = max(enemies, key=lambda e: e["hp"])
            elif p["target_rule"] == "counter":
                counters =[e for e in enemies if is_counter(p["weapon"], e["shield"], weapons_dict)]
                target = min(counters, key=lambda e: calc_dist(p["x"], p["y"], e["x"], e["y"])[2]) if counters else min(enemies, key=lambda e: calc_dist(p["x"], p["y"], e["x"], e["y"])[2])
            else:
                target = min(enemies, key=lambda e: calc_dist(p["x"], p["y"], e["x"], e["y"])[2])

        vx, vy = repulsion[p["name"]][0], repulsion[p["name"]][1]
        
        # ĐỊNH NGHĨA TRẠNG THÁI: TÌNH TRẠNG CHẠY BO KHẨN CẤP
        panic_zone = outside_zone and (not is_camping or p["hp"] < (p["max_hp"] * 0.5))

        # =========================================================================
        # ĐÃ FIX: TRÍ TUỆ AI BẢN NĂNG SINH TỒN - TUYỆT VỌNG ĐI TÌM MÁU
        # =========================================================================
        nearest_airdrop = min(game_state.airdrops, key=lambda d: calc_dist(p["x"], p["y"], d["x"], d["y"])[2], default=None)
        adist = calc_dist(p["x"], p["y"], nearest_airdrop["x"], nearest_airdrop["y"])[2] if nearest_airdrop else 9999
        
        # Máu dưới 40% và Có thùng thính cách không quá xa (1500px)
        is_desperate_for_heal = p["hp"] < (p["max_hp"] * 0.40) and nearest_airdrop and adist < 1500

        if panic_zone:
            # 1. Chạy bo khẩn cấp
            zx, zy, zdist = calc_dist(p["x"], p["y"], game_state.zone_x, game_state.zone_y)
            vx += (zx/zdist) * base_speed * 1.8
            vy += (zy/zdist) * base_speed * 1.8
            
            if p["weapon"] in["bow", "spear", "dagger"] and nearest_enemy:
                ex, ey, edist = calc_dist(p["x"], p["y"], nearest_enemy["x"], nearest_enemy["y"])
                if edist < w_data["max_rng"] * 0.8:
                    vx -= (ex/edist) * base_speed * 1.5
                    vy -= (ey/edist) * base_speed * 1.5

        elif is_desperate_for_heal:
            # 2. KHÁT MÁU TUYỆT VỌNG: Bỏ mọi chiến thuật, lao thẳng đi ăn thùng thính (Tốc độ x1.7)
            ax, ay, _ = calc_dist(p["x"], p["y"], nearest_airdrop["x"], nearest_airdrop["y"])
            vx += (ax/adist) * base_speed * 1.7
            vy += (ay/adist) * base_speed * 1.7
            
            # Đang cắm đầu chạy ăn máu mà có kẻ địch ngáng đường -> Lách nhẹ né tránh
            if nearest_enemy:
                ex, ey, edist = calc_dist(p["x"], p["y"], nearest_enemy["x"], nearest_enemy["y"])
                if edist < w_data["max_rng"]:
                    vx -= (ex/edist) * base_speed * 1.0
                    vy -= (ey/edist) * base_speed * 1.0
        else:
            # 3. NHẶT THÍNH TIỆN ĐƯỜNG (Tham lam)
            # Máu < 85% và rớt ngay gần mình (350px)
            if nearest_airdrop and p["hp"] < (p["max_hp"] * 0.85) and adist < 350:
                ax, ay, _ = calc_dist(p["x"], p["y"], nearest_airdrop["x"], nearest_airdrop["y"])
                vx += (ax/adist) * base_speed * 1.2
                vy += (ay/adist) * base_speed * 1.2

            if is_camping:
                dist_to_enemy = calc_dist(p["x"], p["y"], nearest_enemy["x"], nearest_enemy["y"])[2] if nearest_enemy else 9999
                can_tank = outside_zone and p["hp"] > (p["max_hp"] * 0.3) and p["hp"] >= min_enemy_hp
                
                if dist_to_enemy < (card_w * 3):
                    ex, ey, edist = calc_dist(p["x"], p["y"], nearest_enemy["x"], nearest_enemy["y"])
                    vx -= (ex/edist) * base_speed * 1.2
                    vy -= (ey/edist) * base_speed * 1.2 
                else:
                    if can_tank: pass 
                    else:
                        if outside_zone:
                            zx, zy, zdist = calc_dist(p["x"], p["y"], game_state.zone_x, game_state.zone_y)
                            vx += (zx/zdist) * base_speed * 0.8
                            vy += (zy/zdist) * base_speed * 0.8
                        else:
                            p["wander_angle"] += random.uniform(-0.5, 0.5)
                            vx += math.cos(p["wander_angle"]) * (base_speed * 0.4)
                            vy += math.sin(p["wander_angle"]) * (base_speed * 0.4)
            else:
                if target:
                    dx, dy, dist = calc_dist(p["x"], p["y"], target["x"], target["y"])
                    
                    if p["cooldown"] > 0:
                        if p["weapon"] in["bow", "spear", "dagger"]:
                            vx -= (dx/dist) * base_speed * 0.45
                            vy -= (dy/dist) * base_speed * 0.45
                        else:
                            if dist > 40:
                                vx += (dx/dist) * base_speed * 1.1
                                vy += (dy/dist) * base_speed * 1.1
                    else:
                        if dist > w_data["max_rng"]:
                            dir_x, dir_y = dx/dist, dy/dist
                            if p["weapon"] == "dagger":
                                orth_x, orth_y = -dir_y, dir_x
                                zig = math.sin(game_state.ticks * 0.3) * 2.0
                                vx += (dir_x + orth_x * zig) * base_speed * 1.1
                                vy += (dir_y + orth_y * zig) * base_speed * 1.1
                            else:
                                vx += dir_x * base_speed * 1.1
                                vy += dir_y * base_speed * 1.1
                        elif dist < w_data["max_rng"] * 0.75 and p["weapon"] in["bow", "spear"]:
                            vx -= (dx/dist) * base_speed * 0.45
                            vy -= (dy/dist) * base_speed * 0.45

        preferred_target = target if not is_camping else nearest_enemy

        if p["cooldown"] <= 0 and enemies:
            enemies_in_range =[]
            for e in enemies:
                ex, ey, edist = calc_dist(p["x"], p["y"], e["x"], e["y"])
                if w_data["min_rng"] <= edist <= w_data["max_rng"]:
                    enemies_in_range.append((e, edist, ex, ey))
            
            if enemies_in_range:
                actual_target_info = next((t for t in enemies_in_range if preferred_target and t[0]["name"] == preferred_target["name"]), None)
                if not actual_target_info: actual_target_info = min(enemies_in_range, key=lambda t: t[1])
                
                actual_target, adist, ax, ay = actual_target_info

                t_shield_data = shields_dict[actual_target["shield"]]
                
                dodge_chance = float(t_shield_data.get("dodge", 0))
                crit_chance = float(w_data.get("crit", 0))
                
                if random.random() < dodge_chance:
                    game_state.events.append({"type": "dodge", "x": actual_target["x"], "y": actual_target["y"]})
                    p["cooldown"] = w_data["cd_ticks"]
                else:
                    base_dmg = float(w_data["dmg"])
                    if p["weapon"] == "bow" and actual_target["shield"] == "steel_shield": base_dmg /= 2.0
                    
                    multiplier = 2.0 if is_counter(p["weapon"], actual_target["shield"], weapons_dict) else 1.0
                    
                    is_crit = False
                    if random.random() < crit_chance:
                        is_crit = True
                        base_dmg *= float(w_data.get("crit_mult", 1.5))
                    
                    final_dmg = (base_dmg * multiplier) * (1.0 - float(t_shield_data["block"]))
                    actual_target["hp"] -= final_dmg
                    p["cooldown"] = w_data["cd_ticks"]

                    game_state.events.append({
                        "type": "attack", "weapon": p["weapon"],
                        "x": p["x"], "y": p["y"], "tx": actual_target["x"], "ty": actual_target["y"],
                        "is_crit": is_crit, "dmg": int(final_dmg)
                    })
                    game_state.events.append({"type": "hurt", "weapon": actual_target["weapon"], "x": actual_target["x"], "y": actual_target["y"]})
                    
                    if p["weapon"] in["bow", "dagger", "spear"]:
                        game_state.projectiles.append({"x": p["x"], "y": p["y"], "vx": (ax/adist)*20, "vy": (ay/adist)*20, "life": int(adist/20), "type": p["weapon"]})

                    if p["weapon"] in["sword", "hammer"]:
                        kb = 10 if p["weapon"] == "sword" else 25
                        actual_target["x"] += (ax/adist) * kb
                        actual_target["y"] += (ay/adist) * kb

                    if is_crit:
                        game_state.add_log(f"💥 BẠO KÍCH! {p['name']} chém {int(final_dmg)} HP vào {actual_target['name']}!", f"💥 CRITICAL! {p['name']} hits {int(final_dmg)} dmg on {actual_target['name']}!")
                    
                    if actual_target["hp"] <= 0:
                        actual_target["hp"] = 0
                        actual_target["alive"] = False
                        game_state.events.append({"type": "death"})
                        game_state.add_log(f"💀 {p['name']} đã quét dọn {actual_target['name']}!", f"💀 {p['name']} killed {actual_target['name']}!")

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
        await asyncio.sleep(0.1)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(game_loop())