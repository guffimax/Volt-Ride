from fastapi import FastAPI, Depends, HTTPException, status, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import Optional
import models, database

models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="Volt Ride: Ultimate Synchronization Matrix")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SEAT_TRACKER_MEMORY = {}

def get_db():
    db = database.SessionLocal()
    try: yield db
    finally: db.close()

CAMPUS_GRAPH = {
    "Gym": ["Admin Block", "Canteen"],
    "Admin Block": ["Gym", "Library", "Hostel"],
    "Library": ["Admin Block", "CS Dept"],
    "CS Dept": ["Library", "Canteen"],
    "Canteen": ["Gym", "CS Dept"],
    "Hostel": ["Admin Block"]
}

def compute_shortest_campus_path(start_node: str, end_node: str) -> str:
    s_clean = str(start_node).strip().title()
    e_clean = str(end_node).strip().title()
    if s_clean not in CAMPUS_GRAPH or e_clean not in CAMPUS_GRAPH: return f"{start_node} ➡️ {end_node}"
    if s_clean == e_clean: return s_clean
    queue = [[s_clean]]
    visited = set()
    while queue:
        path = queue.pop(0)
        node = path[-1]
        if node == e_clean: return " ➡️ ".join(path)
        if node not in visited:
            visited.add(node)
            for n in CAMPUS_GRAPH.get(node, []):
                new_path = list(path)
                new_path.append(n)
                queue.append(new_path)
    return f"{start_node} ➡️ {end_node}"

@app.post("/auth/register/")
def register_user(user_data: dict, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == user_data.get("email")).first()
    if existing: raise HTTPException(status_code=400, detail="Identity mapping already exists.")
    email_str = str(user_data.get("email", "")).lower()
    role_assigned = user_data.get("role")
    if "admin" in email_str: role_assigned = "ADMIN"
    new_user = models.User(name=user_data.get("name"), email=user_data.get("email"), password=user_data.get("password"), role=role_assigned, status="AVAILABLE", wallet_balance=200 if role_assigned == "FACULTY" else 0)
    db.add(new_user)
    db.commit()
    return {"status": "SUCCESS", "name": new_user.name}

@app.post("/auth/login/")
def login_user(login_data: dict, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == login_data.get("email"), models.User.password == login_data.get("password")).first()
    if not user: raise HTTPException(status_code=401, detail="Invalid credentials.")
    return {"user_id": user.id, "name": user.name, "email": user.email, "role": user.role, "wallet_balance": user.wallet_balance}

@app.get("/nodes/")
def get_nodes(db: Session = Depends(get_db)): return db.query(models.CampusNode).all()

@app.post("/nodes/")
def add_node(node_data: dict, db: Session = Depends(get_db), x_user_role: Optional[str] = Header(None)):
    if x_user_role != "ADMIN": raise HTTPException(status_code=403)
    new_node = models.CampusNode(building_name=node_data.get("building_name"))
    db.add(new_node)
    db.commit()
    return {"status": "SUCCESS"}

@app.post("/rides/book/")
def book_ride(ride_data: dict, db: Session = Depends(get_db)):
    try:
        faculty_id = str(ride_data.get("faculty_id")) 
        src_name = str(ride_data.get("source_node_name", "")).strip()
        dst_name = str(ride_data.get("destination_node_name", "")).strip()
        seats = int(ride_data.get("seats_requested", 1))
        fare = 20 if seats == 1 else (30 if seats == 2 else 40)
        
        buyer = db.query(models.User).filter(models.User.id == int(faculty_id)).first()
        if buyer and buyer.wallet_balance < fare: raise HTTPException(status_code=400, detail="Insufficient Points.")
        
        src_node = db.query(models.CampusNode).filter(models.CampusNode.building_name == src_name).first()
        dst_node = db.query(models.CampusNode).filter(models.CampusNode.building_name == dst_name).first()
        
        src_id = src_node.id if src_node else 1
        dst_id = dst_node.id if dst_node else 2
        
        existing = db.query(models.Ride).filter(models.Ride.source_node_id == src_id, models.Ride.destination_node_id == dst_id, models.Ride.status == "PENDING").first()
        if existing:
            fac_list = str(existing.faculty_id).split(",")
            if faculty_id not in fac_list:
                existing.faculty_id = f"{existing.faculty_id},{faculty_id}"
                db.commit()
            return {"status": "POOLED", "ride_id": int(existing.id)}
            
        new_ride = models.Ride(faculty_id=faculty_id, source_node_id=src_id, destination_node_id=dst_id, status="PENDING", driver_id=None, fare_points=fare)
        db.add(new_ride)
        db.commit()
        db.refresh(new_ride)
        
        SEAT_TRACKER_MEMORY[int(new_ride.id)] = seats
        return {"status": "SEARCHING", "ride_id": int(new_ride.id)}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/driver/ping-ride/{driver_id}")
def ping_for_new_ride(driver_id: int, db: Session = Depends(get_db)):
    try:
        driver = db.query(models.User).filter(models.User.id == driver_id, models.User.role == "DRIVER").first()
        if not driver or driver.status != "AVAILABLE": return {"has_request": False}
        
        pending = db.query(models.Ride).filter(models.Ride.status == "PENDING").order_by(models.Ride.id.desc()).first()
        if pending:
            source = db.query(models.CampusNode).filter(models.CampusNode.id == pending.source_node_id).first()
            dest = db.query(models.CampusNode).filter(models.CampusNode.id == pending.destination_node_id).first()
            s_name = source.building_name if source else "BUILD 1"
            d_name = dest.building_name if dest else "BUILD 2"
            
            names = []
            for f in str(pending.faculty_id).split(","):
                if f.strip():
                    u = db.query(models.User).filter(models.User.id == int(f.strip())).first()
                    if u: names.append(u.name)
            p_names = " + ".join(names) if names else "Campus Faculty"
            s_count = SEAT_TRACKER_MEMORY.get(int(pending.id), 1)
            
            return {"has_request": True, "ride_id": int(pending.id), "source": s_name, "destination": d_name, "passengers": f"{p_names} ({s_count} Seats)"}
        return {"has_request": False}
    except: return {"has_request": False}

@app.post("/rides/accept/{ride_id}/{driver_id}")
def accept_ride(ride_id: int, driver_id: int, db: Session = Depends(get_db)):
    r = db.query(models.Ride).filter(models.Ride.id == ride_id).first()
    d = db.query(models.User).filter(models.User.id == driver_id).first()
    if r and r.status == "PENDING" and d and d.status == "AVAILABLE":
        r.driver_id = driver_id; r.status = "ACCEPTED"; d.status = "BUSY"; db.commit(); return {"status": "SUCCESS"}
    raise HTTPException(status_code=400)

@app.post("/rides/decline/{ride_id}")
def decline_ride(ride_id: int, db: Session = Depends(get_db)):
    r = db.query(models.Ride).filter(models.Ride.id == ride_id).first()
    if r: r.status = "DECLINED"; db.commit(); return {"status": "SUCCESS"}
    return {"status": "NOT_FOUND"}

@app.get("/driver/active-ride/{driver_id}")
def check_driver_active_ride(driver_id: int, db: Session = Depends(get_db)):
    r = db.query(models.Ride).filter(models.Ride.driver_id == driver_id, models.Ride.status == "ACCEPTED").first()
    if r:
        src = db.query(models.CampusNode).filter(models.CampusNode.id == r.source_node_id).first()
        dst = db.query(models.CampusNode).filter(models.CampusNode.id == r.destination_node_id).first()
        s_nm = src.building_name if src else "BUILD 1"
        d_nm = dst.building_name if dst else "BUILD 2"
        s_count = SEAT_TRACKER_MEMORY.get(int(r.id), 1)
        return {"active": True, "ride_id": r.id, "source": s_nm, "destination": d_nm, "navigation": compute_shortest_campus_path(s_nm, d_nm), "manifest_seats": f"{s_count} Seats"}
    return {"active": False}

@app.post("/rides/complete/{ride_id}")
def complete_ride(ride_id: int, db: Session = Depends(get_db)):
    r = db.query(models.Ride).filter(models.Ride.id == ride_id).first()
    if r:
        r.status = "COMPLETED"
        d = db.query(models.User).filter(models.User.id == r.driver_id).first()
        if d: d.status = "AVAILABLE"
        for f in str(r.faculty_id).split(","):
            if f.strip():
                u = db.query(models.User).filter(models.User.id == int(f.strip())).first()
                if u: u.wallet_balance = max(0, u.wallet_balance - r.fare_points)
        db.commit(); return {"status": "SUCCESS"}
    raise HTTPException(status_code=404)

@app.get("/history/{user_id}")
def get_user_ride_history(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    history_list = []
    if user:
        rides = db.query(models.Ride).all() if user.role in ["FACULTY", "ADMIN"] else db.query(models.Ride).filter(models.Ride.driver_id == user_id).all()
        for r in rides:
            fac_ids = str(r.faculty_id).split(",")
            if user.role in ["DRIVER"] or str(user_id) in fac_ids:
                src = db.query(models.CampusNode).filter(models.CampusNode.id == r.source_node_id).first()
                dst = db.query(models.CampusNode).filter(models.CampusNode.id == r.destination_node_id).first()
                drv = db.query(models.User).filter(models.User.id == r.driver_id).first() if r.driver_id else None
                history_list.append({"ride_id": r.id, "route": f"{src.building_name if src else 'BUILD 1'} ➡️ {dst.building_name if dst else 'BUILD 2'}", "pilot": drv.name if drv else "Searching Pilot...", "fare": r.fare_points, "status": r.status})
    return history_list

@app.get("/auth/profile/{user_id}")
def get_profile_wallet(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    return {"wallet_balance": user.wallet_balance} if user else HTTPException(status_code=404)