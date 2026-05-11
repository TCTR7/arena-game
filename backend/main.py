import asyncio
import json
import math
import random
import os
import string
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

TARGET_NAMES = {"nearest": "Người Gần Nhất", "lowest_hp": "Bắt Nạt Kẻ Yếu", "tankiest": "Thử Thách Độ Trâu", "counter": "Tìm Khắc Hệ"}
CAMP_NAMES = {"attack": "Nhiệt Huyết (Va chạm)", "top5": "Bảo Toàn (Top 5)", "top3": "Chờ Thời (Top 3)", "top2": "Nhẫn Nhịn (Top 2)"}

class GameState:
    def __init__(self, room_id: str, host_pwd: str):
        self.room_id = room_id
        self.host_pwd = host_pwd
        self.phase = "waiting"
        self.config = {
            "room_name": f"Đấu Trường {room_id}", 
            "map_width": 2000, 
            "map_height": 2000, 
            "bg_color": "#84cc16",  # Mặc định: Xanh Cỏ
            "language": "vi",
            "character_settings": {"base_hp": 500, "card_width": 100, "card_height": 130},
            "weapons": {
                "dagger": {"n": "Dao", "e": "🗡️", "min_rng": 50, "max_rng": 160, "dmg": 14, "cd_ticks": 4, "weight": 0, "counters": "wood_shield", "crit": 0.30, "crit_mult": 2.0},
                "sword": {"n": "Kiếm", "e": "⚔️", "min_rng": 0, "max_rng": 110, "dmg": 25, "cd_ticks": 10, "weight": 15, "counters":["wood_shield", "buckler"], "crit": 0.15, "crit_mult": 1.5},
                "spear": {"n": "Giáo", "e": "🔱", "min_rng": 50, "max_rng": 140, "dmg": 22, "cd_ticks": 12, "weight": 20, "counters":["steel_shield", "buckler"], "crit": 0.10, "crit_mult": 1.5},
                "bow": {"n": "Cung", "e": "🏹", "min_rng": 100, "max_rng": 300, "dmg": 18, "cd_ticks": 8, "weight": 10, "counters":["buckler", "wood_shield"], "crit": 0.15, "crit_mult": 1.5},
                "hammer": {"n": "Búa", "e": "🔨", "min_rng": 0, "max_rng": 100, "dmg": 65, "cd_ticks": 22, "weight": 40, "counters": "steel_shield", "crit": 0.0, "crit_mult": 1.0}
            },
            "shields": {
                "buckler": {"n": "Khiên nhỏ", "e": "🥏", "weight": 2, "block": 0.05, "dodge": 0.25},
                "wood_shield": {"n": "Khiên gỗ", "e": "🪵", "weight": 20, "block": 0.35, "dodge": 0.05},
                "steel_shield": {"n": "Khiên thép", "e": "🛡️", "weight": 60, "block": 0.65, "dodge": 0.0}
            }
        }
        self.players = {}
        self.logs = []
        self.events = []
        self.projectiles = []
        self.bushes = []
        self.airdrops = []
        self.ticks = 0
        self.phase2_timer = 180
        self.reveal_timer = 25 
        self.zone_target_radius = 2000
        self.zone_current_radius = 2000
        self.zone_x = 1000
        self.zone_y = 1000

    def add_log(self, msg_vi, msg_en):
        msg = msg_vi if self.config["language"] == "vi" else msg_en
        self.logs.insert(0, msg)
        if len(self.logs) > 30: self.logs.pop()

rooms: Dict[str, GameState] = {}
room_connections: Dict[str, List[WebSocket]] = {}

class CreateRoomReq(BaseModel): room_id: str; host_pwd: str
class ConfigReq(BaseModel): room_name: str; map_width: int; map_height: int; language: str; bg_color: str 
class RegisterReq(BaseModel): name: str; pwd: str; weapon: str; shield: str; avatar: str; color: str
class StrategyReq(BaseModel): name: str; pwd: str; target_rule: str; camp_rule: str
class ForceEndReq(BaseModel): pwd: str

@app.post("/api/create_room")
def create_room(req: CreateRoomReq):
    r_id = req.room_id.upper().strip()
    if not r_id: return {"error": "Mã phòng không hợp lệ"}
    if r_id in rooms: return {"error": "Phòng đã tồn tại, vui lòng chọn mã khác!"}
    rooms[r_id] = GameState(r_id, req.host_pwd)
    room_connections[r_id] = []
    return {"status": "ok", "room_id": r_id}

@app.get("/api/check_room/{room_id}")
def check_room(room_id: str):
    r_id = room_id.upper().strip()
    if r_id in rooms: return {"status": "ok"}
    return {"error": "Phòng không tồn tại"}

@app.post("/api/{room_id}/config")
def save_config(room_id: str, req: ConfigReq):
    r_id = room_id.upper()
    if r_id in rooms:
        rooms[r_id].config.update(req.dict())
        return {"status": "ok"}
    return {"error": "Room not found"}

@app.post("/api/{room_id}/register")
def register_player(room_id: str, req: RegisterReq):
    r_id = room_id.upper()
    if r_id not in rooms: return {"error": "Room not found"}
    state = rooms[r_id]
    if req.name in state.players and state.players[req.name]["pwd"] != req.pwd:
        return {"error": "Sai mật khẩu hoặc tên đã có người dùng"}
    
    base_hp = state.config["character_settings"]["base_hp"]
    state.players[req.name] = {
        "name": req.name, "pwd": req.pwd, "weapon": req.weapon, "shield": req.shield,
        "avatar": req.avatar, "color": req.color,
        "target_rule": random.choice(["nearest", "lowest_hp", "tankiest", "counter"]),
        "camp_rule": random.choice(["attack", "top5", "top3", "top2"]),
        "hp": base_hp, "max_hp": base_hp, "alive": True,
        "x": random.randint(100, state.config["map_width"] - 100),
        "y": random.randint(100, state.config["map_height"] - 100),
        "cooldown": 0, "wander_angle": random.uniform(0, math.pi*2),
        "in_bush": False, "flash_red": False, "kills": 0, "killed_names": [],
        "heals_looted": 0, "damage_dealt": 0.0, "damage_taken": 0.0,
        "angry_ticks": 0, "last_attacker": ""
    }
    return {"status": "ok"}

@app.post("/api/{room_id}/strategy")
def set_strategy(room_id: str, req: StrategyReq):
    r_id = room_id.upper()
    if r_id in rooms:
        state = rooms[r_id]
        if req.name in state.players and state.players[req.name]["pwd"] == req.pwd:
            state.players[req.name]["target_rule"] = req.target_rule
            state.players[req.name]["camp_rule"] = req.camp_rule
            return {"status": "ok"}
        return {"error": "Sai tên hoặc mật khẩu"}
    return {"error": "Room not found"}

@app.post("/api/{room_id}/bots")
def add_bots(room_id: str):
    r_id = room_id.upper()
    if r_id not in rooms: return {"error": "Room not found"}
    state = rooms[r_id]
    names = ["Kế Toán", "Nhân Sự", "Tester", "Dev Cứng", "Sếp Lớn", "Lao Công"]
    avatars = ["🐘", "🐕", "🐈", "🐔", "🐢", "🐧", "🦖", "🐒", "🐯", "🐻"]
    
    # BẢNG MÀU BOT TỐI VÀ ĐẬM (Tương phản với nền Xanh/Vàng)
    colors = ["#7f1d1d", "#1e3a8a", "#581c87", "#9f1239", "#b45309", "#064e3b", "#0f766e", "#374151"]
    
    base_hp = state.config["character_settings"]["base_hp"]
    for name in names:
        bot_name = f"Bot_{name}_{random.randint(10,99)}"
        state.players[bot_name] = {
            "name": bot_name, "pwd": "bot", "avatar": random.choice(avatars), "color": random.choice(colors),
            "weapon": random.choice(list(state.config["weapons"].keys())),
            "shield": random.choice(list(state.config["shields"].keys())),
            "target_rule": random.choice(["nearest", "lowest_hp", "tankiest", "counter"]),
            "camp_rule": random.choice(["attack", "top5", "top3", "top2"]),
            "hp": base_hp, "max_hp": base_hp, "alive": True,
            "x": random.randint(100, state.config["map_width"] - 100),
            "y": random.randint(100, state.config["map_height"] - 100),
            "cooldown": 0, "wander_angle": random.uniform(0, math.pi*2),
            "in_bush": False, "flash_red": False, "kills": 0, "killed_names": [],
            "heals_looted": 0, "damage_dealt": 0.0, "damage_taken": 0.0,
            "angry_ticks": 0, "last_attacker": ""
        }
    return {"status": "ok"}

@app.post("/api/{room_id}/clear_players")
def clear_players(room_id: str):
    r_id = room_id.upper()
    if r_id in rooms: rooms[r_id].players = {}
    return {"status": "ok"}

@app.post("/api/{room_id}/phase/{phase}")
def set_phase(room_id: str, phase: str):
    r_id = room_id.upper()
    if r_id not in rooms: return {"error": "Room not found"}
    state = rooms[r_id]
    state.phase = phase
    if phase == "strategy": state.phase2_timer = 180
    elif phase == "reveal": state.reveal_timer = 25
    elif phase == "playing":
        state.logs = []
        state.add_log("🎤 Trận đấu xin phép được bắt đầu!", "🎤 Let the battle begin!")
        state.projectiles = []; state.ticks = 0
        w, h = state.config["map_width"], state.config["map_height"]
        state.zone_x = w / 2; state.zone_y = h / 2
        state.zone_target_radius = math.hypot(w, h) / 2
        state.zone_current_radius = state.zone_target_radius
        
        state.bushes = [{"x": random.randint(200, w-200), "y": random.randint(200, h-200), "r": random.randint(120, 180)} for _ in range(8)]
        state.airdrops = []

        base_hp = state.config["character_settings"]["base_hp"]
        for p in state.players.values():
            p["max_hp"] = p["hp"] = base_hp; p["alive"] = True
            p["x"] = random.randint(100, w - 100); p["y"] = random.randint(100, h - 100)
            p["cooldown"] = p["kills"] = p["heals_looted"] = p["angry_ticks"] = 0
            p["in_bush"] = p["flash_red"] = False
            p["killed_names"] = []
            p["damage_dealt"] = p["damage_taken"] = 0.0
            p["last_attacker"] = ""
    return {"status": "ok"}

@app.post("/api/{room_id}/force_end")
def force_end_game(room_id: str, req: ForceEndReq):
    r_id = room_id.upper()
    if r_id not in rooms: return {"error": "Room not found"}
    state = rooms[r_id]
    if req.pwd != state.host_pwd: return {"error": "Sai mật khẩu Host!"}
    
    if state.phase == "playing":
        alive_players = [p for p in state.players.values() if p["alive"]]
        if alive_players:
            alive_players.sort(key=lambda x: x["hp"], reverse=True)
            winner = alive_players[0]
            for p in alive_players[1:]: p["hp"] = 0; p["alive"] = False
            state.add_log(f"🛑 Trọng tài tuýt còi! {winner['name']} win nhờ máu to!", f"🛑 Referee stopped the match! {winner['name']} wins!")
            state.events.append({"type": "win"})
        state.phase = "finished"
    return {"status": "ok"}

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await websocket.accept()
    r_id = room_id.upper()
    if r_id not in room_connections: room_connections[r_id] = []
    room_connections[r_id].append(websocket)
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        room_connections[r_id].remove(websocket)

async def broadcast_all():
    for r_id, state in list(rooms.items()):
        if r_id not in room_connections or not room_connections[r_id]: continue
        
        data = {
            "phase": state.phase, 
            "host_pwd": state.host_pwd, 
            "config": state.config, 
            "players": state.players,
            "logs": state.logs, 
            "events": state.events, 
            "projectiles": state.projectiles,
            "timer": state.phase2_timer, 
            "reveal_timer": state.reveal_timer,
            "zone": {"x": state.zone_x, "y": state.zone_y, "r": state.zone_current_radius},
            "bushes": state.bushes, 
            "airdrops": state.airdrops
        }
        msg = json.dumps(data)
        for conn in room_connections[r_id]:
            try: await conn.send_text(msg)
            except: pass
        state.events.clear()

def calc_dist(x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    dist = math.hypot(dx, dy)
    if dist < 0.001: return 1.0, 1.0, 1.414
    return dx, dy, dist

def is_counter(weap, shield, weapons_dict):
    counters = weapons_dict[weap]["counters"]
    if isinstance(counters, list): return shield in counters
    return shield == counters

def update_room_logic(state: GameState):
    state.ticks += 1
    
    if state.phase == "strategy" and state.ticks % 10 == 0:
        state.phase2_timer -= 1
        if state.phase2_timer <= 0: state.phase = "reveal"
        return

    if state.phase == "reveal" and state.ticks % 10 == 0:
        state.reveal_timer -= 1
        if state.reveal_timer <= 0: set_phase(state.room_id, "playing") 
        return

    if state.phase != "playing": return

    w_map = state.config["map_width"]; h_map = state.config["map_height"]
    weapons_dict = state.config["weapons"]; shields_dict = state.config["shields"]
    card_w = state.config["character_settings"]["card_width"]; boid_radius = card_w * 0.45 

    if state.ticks % 100 == 0:
        state.zone_target_radius = max(0, state.zone_target_radius - 75)
        state.add_log("⚠️ Bo thu! Nhấc giò lên chạy lẹ bà con ơi!", "⚠️ The Red Zone is shrinking!")

    if state.zone_current_radius > state.zone_target_radius:
        state.zone_current_radius -= 2.0
        if state.zone_current_radius < 0: state.zone_current_radius = 0

    if state.zone_current_radius <= 0 and len(state.bushes) > 0:
        state.bushes = []
        state.add_log("🔥 Cháy rừng! Các Ninja rùa hết chỗ trốn rồi nha!", "🔥 All bushes burned!")

    drop_interval = 450 if state.zone_current_radius <= 50 else 150
    if state.ticks % drop_interval == 0 and len(state.airdrops) < 5 and state.zone_current_radius > 200:
        safe_r = max(100, int(state.zone_current_radius / 2))
        drop_x = state.zone_x + random.randint(-safe_r, safe_r)
        drop_y = state.zone_y + random.randint(-safe_r, safe_r)
        state.airdrops.append({"x": drop_x, "y": drop_y})
        state.add_log("🎁 Thính rơi! Ai nhân phẩm tốt thì vào xơi!", "🎁 An Airdrop has landed!")

    new_projs = []
    for proj in state.projectiles:
        proj["life"] -= 1; proj["x"] += proj["vx"]; proj["y"] += proj["vy"]
        if proj["life"] > 0: new_projs.append(proj)
    state.projectiles = new_projs

    alive_players = [p for p in state.players.values() if p["alive"]]
    alive_count = len(alive_players)

    if alive_count <= 1:
        if alive_count == 1:
            winner = alive_players[0]
            state.add_log(f"🏆 Hết nấc! {winner['name']} đã vô địch xóm!", f"🏆 {winner['name']} won!")
            state.events.append({"type": "win"})
        state.phase = "finished"
        return

    if state.ticks % 60 == 0 and random.random() < 0.6 and alive_count > 1:
        cp = random.choice(alive_players)
        comment_vi = ""
        _, _, d_to_z = calc_dist(cp["x"], cp["y"], state.zone_x, state.zone_y)
        cp_outside = d_to_z > state.zone_current_radius
        
        if cp_outside and cp["in_bush"]: comment_vi = f"🎤 Bo cắn tụt quần mà {cp['name']} vẫn ngồi thiền. Quá cứng!"
        elif cp_outside: comment_vi = f"🎤 {cp['name']} đang cắm đầu chạy bo sấp mặt!"
        elif cp["in_bush"] and cp["camp_rule"] != "attack": comment_vi = f"🎤 {cp['name']} hóa kiếp Ninja Rùa. Im lìm đến đáng sợ!"
        elif cp["camp_rule"] == "attack": comment_vi = f"🎤 {cp['name']} đánh khét thật, y như đang chạy KPI cuối tháng!"
        elif cp["target_rule"] == "lowest_hp": comment_vi = f"🎤 Khôn như {cp['name']}! Toàn me mấy tay yếu máu để KS."
        elif cp["target_rule"] == "tankiest": comment_vi = f"🎤 {cp['name']} cứ thấy ai máu trâu là lao vào đấm. Liều!"
        elif cp["target_rule"] == "counter": comment_vi = f"🎤 {cp['name']} não to! Cầm dao đi gọt mộc là có thật!"
        
        if comment_vi: state.add_log(comment_vi, "🎤 Tactical play going on!")

    repulsion = {p["name"]: [0.0, 0.0] for p in alive_players}
    for i in range(len(alive_players)):
        for j in range(i+1, len(alive_players)):
            p1, p2 = alive_players[i], alive_players[j]
            dx, dy, dist = calc_dist(p1["x"], p1["y"], p2["x"], p2["y"])
            if dist < boid_radius:
                force = (boid_radius - dist) / 5
                repulsion[p1["name"]][0] -= (dx/dist) * force; repulsion[p1["name"]][1] -= (dy/dist) * force
                repulsion[p2["name"]][0] += (dx/dist) * force; repulsion[p2["name"]][1] += (dy/dist) * force

    for p in alive_players:
        p["flash_red"] = False
        if p["angry_ticks"] > 0: p["angry_ticks"] -= 1
        if p["cooldown"] > 0: p["cooldown"] -= 1

        w_data = weapons_dict[p["weapon"]]; s_data = shields_dict[p["shield"]]
        base_speed = max(30, 180 - w_data["weight"] - s_data["weight"]) * 0.05
        p["in_bush"] = any(calc_dist(p["x"], p["y"], b["x"], b["y"])[2] < b["r"] for b in state.bushes)

        new_airdrops = []; healed = False
        for drop in state.airdrops:
            if not healed and calc_dist(p["x"], p["y"], drop["x"], drop["y"])[2] < 40:
                p["hp"] = min(p["max_hp"], p["hp"] + 150)
                p["heals_looted"] += 1
                state.events.append({"type": "heal", "x": p["x"], "y": p["y"], "text": "+150 HP"})
                state.add_log(f"💉 Bơm máu kịp thời! {p['name']} nạp VIP đầy bình quẩy tiếp!", f"💉 {p['name']} healed!")
                healed = True; p["angry_ticks"] = 0 
            else: new_airdrops.append(drop)
        state.airdrops = new_airdrops

        _, _, dist_to_zone = calc_dist(p["x"], p["y"], state.zone_x, state.zone_y)
        outside_zone = dist_to_zone > state.zone_current_radius
        zone_dmg = 2.5 if state.zone_current_radius <= 50 else 0.8

        if outside_zone: p["hp"] -= zone_dmg; p["flash_red"] = True; p["damage_taken"] += zone_dmg

        if p["hp"] <= 0:
            p["hp"] = 0; p["alive"] = False
            state.add_log(f"☠️ Cạn lời! {p['name']} chết ngạt ngoài bo!", f"☠️ {p['name']} died to zone!")
            state.events.append({"type": "death"})
            continue

        is_angry = p["angry_ticks"] > 0
        is_berserk = p["hp"] < (p["max_hp"] * 0.25) or is_angry 
        is_fleeing = (p["hp"] < (p["max_hp"] * 0.40)) and not is_berserk
        
        is_camping = False
        if not is_fleeing and not is_berserk:
            c = p["camp_rule"]
            if c == "top5" and alive_count > 5: is_camping = True
            if c == "top3" and alive_count > 3: is_camping = True
            if c == "top2" and alive_count > 2: is_camping = True
            
        if state.zone_current_radius <= 100: is_camping = is_fleeing = False

        enemies = [e for e in alive_players if e["name"] != p["name"] and (not e["in_bush"] or calc_dist(p["x"], p["y"], e["x"], e["y"])[2] < 60)]
        min_enemy_hp = min((e["hp"] for e in enemies), default=0)
        nearest_enemy = min(enemies, key=lambda e: calc_dist(p["x"], p["y"], e["x"], e["y"])[2]) if enemies else None
        dist_to_enemy = calc_dist(p["x"], p["y"], nearest_enemy["x"], nearest_enemy["y"])[2] if nearest_enemy else 9999
        
        target = None
        if enemies:
            if p["target_rule"] == "nearest": target = min(enemies, key=lambda e: calc_dist(p["x"], p["y"], e["x"], e["y"])[2])
            elif p["target_rule"] == "lowest_hp": target = min(enemies, key=lambda e: e["hp"])
            elif p["target_rule"] == "tankiest": target = max(enemies, key=lambda e: e["hp"])
            elif p["target_rule"] == "counter":
                counters = [e for e in enemies if is_counter(p["weapon"], e["shield"], weapons_dict)]
                target = min(counters, key=lambda e: calc_dist(p["x"], p["y"], e["x"], e["y"])[2]) if counters else min(enemies, key=lambda e: calc_dist(p["x"], p["y"], e["x"], e["y"])[2])
            if is_angry and p["last_attacker"]:
                revenge_target = next((e for e in enemies if e["name"] == p["last_attacker"]), None)
                if revenge_target: target = revenge_target

        vx, vy = repulsion[p["name"]][0], repulsion[p["name"]][1]
        
        wall_margin = 120
        if p["x"] < wall_margin: vx += ((wall_margin - p["x"]) / wall_margin) * base_speed * 1.5
        elif p["x"] > w_map - wall_margin: vx -= ((p["x"] - (w_map - wall_margin)) / wall_margin) * base_speed * 1.5
        if p["y"] < wall_margin: vy += ((wall_margin - p["y"]) / wall_margin) * base_speed * 1.5
        elif p["y"] > h_map - wall_margin: vy -= ((p["y"] - (h_map - wall_margin)) / wall_margin) * base_speed * 1.5

        nearest_airdrop = min(state.airdrops, key=lambda d: calc_dist(p["x"], p["y"], d["x"], d["y"])[2], default=None)
        adist = 9999; drop_in_zone = False
        if nearest_airdrop:
            ax, ay, adist = calc_dist(p["x"], p["y"], nearest_airdrop["x"], nearest_airdrop["y"])
            drop_in_zone = calc_dist(nearest_airdrop["x"], nearest_airdrop["y"], state.zone_x, state.zone_y)[2] <= state.zone_current_radius

        panic_zone = outside_zone and (not is_camping or p["hp"] < (p["max_hp"] * 0.5))

        if panic_zone:
            zx, zy, zdist = calc_dist(p["x"], p["y"], state.zone_x, state.zone_y)
            vx += (zx/zdist) * base_speed * 1.8; vy += (zy/zdist) * base_speed * 1.8
            if nearest_enemy and dist_to_enemy < w_data["max_rng"] * 0.8:
                ex, ey, edist = calc_dist(p["x"], p["y"], nearest_enemy["x"], nearest_enemy["y"])
                vx -= (ex/edist) * base_speed * 1.5; vy -= (ey/edist) * base_speed * 1.5

        elif p["hp"] < (p["max_hp"] * 0.40) and nearest_airdrop and drop_in_zone and adist < 1500:
            vx += (ax/adist) * base_speed * 1.7; vy += (ay/adist) * base_speed * 1.7
            if nearest_enemy and dist_to_enemy < w_data["max_rng"]:
                ex, ey, edist = calc_dist(p["x"], p["y"], nearest_enemy["x"], nearest_enemy["y"])
                vx -= (ex/edist) * base_speed * 1.0; vy -= (ey/edist) * base_speed * 1.0

        elif (p["hp"] < p["max_hp"] * 0.95) and nearest_airdrop and drop_in_zone and (dist_to_enemy > 400):
            vx += (ax/adist) * base_speed * 1.3; vy += (ay/adist) * base_speed * 1.3

        elif is_fleeing:
            nearest_bush = min(state.bushes, key=lambda b: calc_dist(p["x"], p["y"], b["x"], b["y"])[2], default=None)
            bdist = calc_dist(p["x"], p["y"], nearest_bush["x"], nearest_bush["y"])[2] if nearest_bush else 9999
            if p["in_bush"]: pass
            elif nearest_bush and bdist < 1000:
                bx, by, _ = calc_dist(p["x"], p["y"], nearest_bush["x"], nearest_bush["y"])
                vx += (bx/bdist) * base_speed * 1.5; vy += (by/bdist) * base_speed * 1.5
            elif nearest_enemy:
                ex, ey, edist = calc_dist(p["x"], p["y"], nearest_enemy["x"], nearest_enemy["y"])
                vx -= (ex/edist) * base_speed * 1.5; vy -= (ey/edist) * base_speed * 1.5
        else:
            if nearest_airdrop and p["hp"] < (p["max_hp"] * 0.85) and adist < 350 and drop_in_zone:
                vx += (ax/adist) * base_speed * 1.2; vy += (ay/adist) * base_speed * 1.2

            if is_camping:
                if outside_zone and p["hp"] > (p["max_hp"] * 0.3) and p["hp"] >= min_enemy_hp: pass
                elif dist_to_enemy < (card_w * 3):
                    ex, ey, edist = calc_dist(p["x"], p["y"], nearest_enemy["x"], nearest_enemy["y"])
                    vx -= (ex/edist) * base_speed * 1.2; vy -= (ey/edist) * base_speed * 1.2 
                else:
                    if outside_zone:
                        zx, zy, zdist = calc_dist(p["x"], p["y"], state.zone_x, state.zone_y)
                        vx += (zx/zdist) * base_speed * 0.8; vy += (zy/zdist) * base_speed * 0.8
                    else:
                        p["wander_angle"] += random.uniform(-0.5, 0.5)
                        vx += math.cos(p["wander_angle"]) * (base_speed * 0.4); vy += math.sin(p["wander_angle"]) * (base_speed * 0.4)
            else:
                if target:
                    dx, dy, dist = calc_dist(p["x"], p["y"], target["x"], target["y"])
                    if p["cooldown"] > 0:
                        if p["weapon"] in ["bow", "spear", "dagger"]:
                            vx -= (dx/dist) * base_speed * 0.45; vy -= (dy/dist) * base_speed * 0.45
                        elif dist > 40:
                            vx += (dx/dist) * base_speed * 1.1; vy += (dy/dist) * base_speed * 1.1
                    else:
                        if dist > w_data["max_rng"]:
                            dir_x, dir_y = dx/dist, dy/dist
                            if p["weapon"] == "dagger":
                                orth_x, orth_y = -dir_y, dir_x; zig = math.sin(state.ticks * 0.3) * 2.0
                                vx += (dir_x + orth_x * zig) * base_speed * 1.1; vy += (dir_y + orth_y * zig) * base_speed * 1.1
                            else:
                                vx += dir_x * base_speed * 1.1; vy += dir_y * base_speed * 1.1
                        elif dist < w_data["max_rng"] * 0.75 and p["weapon"] in ["bow", "spear"]:
                            vx -= (dx/dist) * base_speed * 0.45; vy -= (dy/dist) * base_speed * 0.45

        can_attack = True
        if p["in_bush"] and is_camping and not is_berserk:
            can_attack = nearest_enemy and dist_to_enemy < 40

        if p["cooldown"] <= 0 and enemies and can_attack:
            enemies_in_range = [(e, calc_dist(p["x"], p["y"], e["x"], e["y"])[2], *calc_dist(p["x"], p["y"], e["x"], e["y"])[:2]) for e in enemies if w_data["min_rng"] <= calc_dist(p["x"], p["y"], e["x"], e["y"])[2] <= w_data["max_rng"]]
            if enemies_in_range:
                preferred_target = target if not is_camping else nearest_enemy
                actual_target_info = next((t for t in enemies_in_range if preferred_target and t[0]["name"] == preferred_target["name"]), None) or min(enemies_in_range, key=lambda t: t[1])
                actual_target, adist, ax, ay = actual_target_info

                t_shield_data = shields_dict[actual_target["shield"]]
                if random.random() < float(t_shield_data.get("dodge", 0)):
                    state.events.append({"type": "dodge", "x": actual_target["x"], "y": actual_target["y"]}); p["cooldown"] = w_data["cd_ticks"]
                else:
                    base_dmg = float(w_data["dmg"]) / 2.0 if p["weapon"] == "bow" and actual_target["shield"] == "steel_shield" else float(w_data["dmg"])
                    multiplier = 2.0 if is_counter(p["weapon"], actual_target["shield"], weapons_dict) else 1.0
                    is_crit = random.random() < float(w_data.get("crit", 0))
                    if is_crit: base_dmg *= float(w_data.get("crit_mult", 1.5))
                    
                    final_dmg = (base_dmg * multiplier) * (1.0 - float(t_shield_data["block"]))
                    actual_target["hp"] -= final_dmg; actual_target["flash_red"] = True
                    actual_target["angry_ticks"] = 40; actual_target["last_attacker"] = p["name"]
                    p["cooldown"] = w_data["cd_ticks"]; p["damage_dealt"] += final_dmg; actual_target["damage_taken"] += final_dmg

                    state.events.append({"type": "attack", "weapon": p["weapon"], "x": p["x"], "y": p["y"], "tx": actual_target["x"], "ty": actual_target["y"], "is_crit": is_crit, "dmg": int(final_dmg)})
                    state.events.append({"type": "hurt", "weapon": actual_target["weapon"], "x": actual_target["x"], "y": actual_target["y"]})
                    
                    if p["weapon"] in ["bow", "dagger", "spear"]: state.projectiles.append({"x": p["x"], "y": p["y"], "vx": (ax/adist)*20, "vy": (ay/adist)*20, "life": int(adist/20), "type": p["weapon"]})
                    if p["weapon"] in ["sword", "hammer"]: actual_target["x"] += (ax/adist) * (10 if p["weapon"] == "sword" else 25); actual_target["y"] += (ay/adist) * (10 if p["weapon"] == "sword" else 25)

                    if is_crit: 
                        state.add_log(f"💥 Bạo kích! {p['name']} gõ trúng đầu {actual_target['name']} bay luôn {int(final_dmg)} máu!", f"💥 Crit! {p['name']} hits {int(final_dmg)}!")
                    if actual_target["hp"] <= 0:
                        actual_target["hp"] = 0; actual_target["alive"] = False; p["kills"] += 1; p["killed_names"].append(actual_target["name"])
                        state.events.append({"type": "death"})
                        state.add_log(f"💀 Xong phim! {actual_target['name']} đã bị {p['name']} tiễn ra chuồng gà!", f"💀 {p['name']} killed {actual_target['name']}!")

        p["x"] += vx; p["y"] += vy
        if p["x"] < 20: p["x"] = 20; p["wander_angle"] = math.pi - p["wander_angle"]
        elif p["x"] > w_map - 20: p["x"] = w_map - 20; p["wander_angle"] = math.pi - p["wander_angle"]
        if p["y"] < 20: p["y"] = 20; p["wander_angle"] = -p["wander_angle"]
        elif p["y"] > h_map - 20: p["y"] = h_map - 20; p["wander_angle"] = -p["wander_angle"]

async def game_loop():
    while True:
        for r_id in list(rooms.keys()):
            update_room_logic(rooms[r_id])
        await broadcast_all()
        await asyncio.sleep(0.1)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(game_loop())

if os.path.exists("dist"):
    app.mount("/assets", StaticFiles(directory="dist/assets"), name="assets")
    @app.get("/{catchall:path}")
    def serve_react_app(catchall: str):
        return FileResponse("dist/index.html")