const BACKEND_URL = "http://localhost:5000";
let activeUser = null; 
let authMode = "login";
let currentActiveRideId = null; 
let radarLockActive = false;    

function switchTab(tab) {
    ['auth', 'portal'].forEach(t => {
        const el = document.getElementById(`panel-${t}`);
        const nav = document.getElementById(`nav-${t}`);
        if(el) el.classList.remove('active');
        if(nav) nav.classList.remove('active');
    });
    document.getElementById(`panel-${tab}`).classList.add('active');
    document.getElementById(`nav-${tab}`).classList.add('active');
    if(tab === 'portal') loadHistoryLogs(); 
}

function toggleAuthMode(mode) {
    authMode = mode;
    if(mode === 'register') {
        document.getElementById('wrapper-name').classList.remove('hidden');
        document.getElementById('wrapper-role').classList.remove('hidden');
        document.getElementById('btn-toggle-reg').classList.add('active');
        document.getElementById('btn-toggle-login').classList.remove('active');
    } else {
        document.getElementById('wrapper-name').classList.add('hidden');
        document.getElementById('wrapper-role').classList.add('hidden');
        document.getElementById('btn-toggle-login').classList.add('active');
        document.getElementById('btn-toggle-reg').classList.remove('active');
    }
}

async function handleAuthSubmit() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const name = document.getElementById('authName').value.trim();
    const role = document.getElementById('authRole').value;
    const statusBox = document.getElementById('authStatus');

    statusBox.style.display = "block";
    statusBox.style.background = "rgba(56, 189, 248, 0.1)"; statusBox.style.color = "#38bdf8";
    statusBox.innerText = "VERIFYING ACCOUNT...";

    try {
        let url = authMode === 'register' ? `${BACKEND_URL}/auth/register/` : `${BACKEND_URL}/auth/login/`;
        let body = authMode === 'register' ? { name, email, password, role } : { email, password };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).catch(() => { throw new Error("SERVER_OFFLINE"); });

        let data = await response.json();
        if(!response.ok) throw new Error(data.detail || "Authentication Failed!");

        statusBox.style.background = "rgba(52, 211, 153, 0.1)"; statusBox.style.color = "#34d399";
        statusBox.innerText = `SUCCESS! WELCOME ${data.name.toUpperCase()}`;

        if(authMode === 'login') {
            activeUser = data; 
            unlockTerminals();
            setTimeout(() => switchTab('portal'), 1000);
        } else {
            setTimeout(() => toggleAuthMode('login'), 1500);
        }
    } catch (err) {
        statusBox.style.background = "rgba(248, 113, 113, 0.1)"; statusBox.style.color = "#f87171";
        statusBox.innerText = err.message === "SERVER_OFFLINE" ? "SERVER DOWN: PLEASE START RECTOR UVICORN PORT 5000." : err.message.toUpperCase();
    }
}

function unlockTerminals() {
    if(!activeUser) return;
    loadBuildings();
    loadHistoryLogs();
    if(activeUser.role === "FACULTY" || activeUser.role === "ADMIN") {
        document.getElementById('faculty-section').style.opacity = "1";
        document.getElementById('faculty-section').style.pointerEvents = "auto";
        document.getElementById('facultyWelcome').innerText = `Logged Operator: ${activeUser.name.toUpperCase()} (#VOLT_0${activeUser.user_id})`;
        document.getElementById('facultyWallet').innerText = `${activeUser.wallet_balance || 0} PTS`;
    } else if (activeUser.role === "DRIVER") {
        document.getElementById('driver-section').style.opacity = "1";
        document.getElementById('driver-section').style.pointerEvents = "auto";
        document.getElementById('driverWelcome').innerText = `Active Duty Pilot: ${activeUser.name.toUpperCase()}`;
        document.getElementById('driverHistoryContainer').classList.remove('hidden');
        document.getElementById('facultyHistoryContainer').classList.add('hidden');
        checkDriverRide();
    }
}

async function loadBuildings() {
    try {
        const response = await fetch(`${BACKEND_URL}/nodes/`);
        const buildings = await response.json();
        const s = document.getElementById('sourceSelect');
        const d = document.getElementById('destinationSelect');
        if(!s || !d) return; s.innerHTML = ''; d.innerHTML = '';
        buildings.forEach(b => {
            let opt1 = document.createElement('option'); opt1.value = b.building_name; opt1.innerText = b.building_name.toUpperCase(); s.appendChild(opt1);
            let opt2 = document.createElement('option'); opt2.value = b.building_name; opt2.innerText = b.building_name.toUpperCase(); d.appendChild(opt2);
        });
    } catch (e) {}
}

async function bookRide() {
    const src = document.getElementById('sourceSelect').value;
    const dest = document.getElementById('destinationSelect').value;
    const seats = document.getElementById('seatsRequestedSelect').value; 
    const card = document.getElementById('facultyStatusCard');
    if(!src || !dest) return;
    
    card.style.display = "block";
    card.style.background = "rgba(251, 191, 36, 0.1)"; card.style.color = "#fbbf24";
    card.innerText = "TRANSMITTING COORDINATES BIND VECTOR...";
    
    try {
        const response = await fetch(`${BACKEND_URL}/rides/book/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ faculty_id: activeUser.user_id, source_node_name: src, destination_node_name: dest, seats_requested: parseInt(seats) })
        });
        
        let data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Booking Rejected!");
        
        currentActiveRideId = data.ride_id; 
        localStorage.setItem('user_ride_state', 'PENDING');
        
        card.style.background = "rgba(56, 189, 248, 0.1)"; card.style.color = "#38bdf8";
        card.innerText = "🎯 RIDE REQUEST TRANSMITTED SUCCESSFULLY! SEARCHING SHUTTLES... 📡";
        
        loadHistoryLogs();
    } catch(e) { 
        card.style.background = "rgba(248, 113, 113, 0.1)"; card.style.color = "#f87171";
        card.innerText = `ERROR: ${e.message.toUpperCase()}`; 
    }
}

async function checkDriverRide() {
    if(!activeUser || activeUser.role !== "DRIVER") return;
    const jobCard = document.getElementById('driverJobCard');
    try {
        const response = await fetch(`${BACKEND_URL}/driver/active-ride/${activeUser.user_id}`);
        const data = await response.json();
        if(response.ok && data.active) {
            removeRapidoPopup();
            jobCard.style.textAlign = "left";
            jobCard.innerHTML = `
                <div style="font-size:11px; font-weight:800; color:#818cf8; text-transform:uppercase; margin-bottom:6px;">Active Route Assigned</div>
                <div style="font-size:14px; font-weight:800; color:#ffffff; margin-bottom:12px;">ROUTE: ${data.source.toUpperCase()} ➡️ ${data.destination.toUpperCase()}</div>
                <div style="background:rgba(245,158,11,0.05); padding:10px; border-radius:8px; font-size:11px; color:#fbbf24; margin-bottom:12px;">
                    <b>BFS NAVIGATION GRAPH MAP:</b><br>${data.navigation.toUpperCase()}
                </div>
                <div style="padding:10px; background:rgba(0,242,254,0.1); border-radius:6px; font-size:11px; font-weight:bold; color:#00f2fe; margin-bottom:15px; text-align:center;">
                    FLEET LOAD: ${data.manifest_seats.toUpperCase()}
                </div>
                <button type="button" onclick="terminateDriverRide(${data.ride_id})" class="btn-prime" style="margin-top:5px; background:linear-gradient(135deg, #818cf8 0%, #6366f1 100%); color:white; padding:10px;">🏁 End Ride</button>
                    `;
        } else {
            jobCard.style.textAlign = "center"; jobCard.innerHTML = "🟢 MONITORING TRANSIT CHANNELS LIVE...";
        }
    } catch(e) {}
}

async function terminateDriverRide(rideId) {
    radarLockActive = true;
    try { 
        await fetch(`${BACKEND_URL}/rides/complete/${rideId}`, { method: 'POST' }); 
        checkDriverRide(); 
        loadHistoryLogs(); 
        setTimeout(()=> { radarLockActive = false; }, 3000); 
    } catch(e){}
}

function showRapidoPopup(rideId, source, destination, passengers) {
    if (radarLockActive || document.getElementById('rapido-alert')) return;
    const popup = document.createElement('div'); popup.id = 'rapido-alert';
    popup.style = "position:fixed; inset:0; background:rgba(3,7,18,0.7); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; z-index:100; padding:10px;";
    popup.innerHTML = `
        <div class="card" style="max-width:360px; width:100%; text-align:center; background:#0f172a; margin-bottom:0;">
            <div style="font-size:11px; color:#00f2fe; text-transform:uppercase; margin-bottom:5px; font-weight:bold;">Incoming Booking pass</div>
            <div class="card-title" style="font-size:16px;">${source.toUpperCase()} ➡️ ${destination.toUpperCase()}</div>
            <div style="background:rgba(3,7,18,0.5); padding:10px; border-radius:8px; font-size:11px; margin:12px 0; color:#cbd5e1; text-align:left;">
                <b>MANIFEST BIND:</b><br>${passengers.toUpperCase()}
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                <button type="button" onclick="rejectRapidoRide(${rideId})" class="btn-action">Decline</button>
                <button type="button" onclick="acceptRapidoRide(${rideId})" class="btn-prime" style="margin:0; padding:10px;">Accept</button>
            </div>
        </div>
    `;
    document.body.appendChild(popup);
}

async function acceptRapidoRide(rideId) { try { await fetch(`${BACKEND_URL}/rides/accept/${rideId}/${activeUser.user_id}`, { method: 'POST' }); removeRapidoPopup(); checkDriverRide(); } catch(e){} }
async function rejectRapidoRide(rideId) { radarLockActive = true; try { await fetch(`${BACKEND_URL}/rides/decline/${rideId}`, { method: 'POST' }); removeRapidoPopup(); setTimeout(()=>{radarLockActive=false;}, 5000); } catch(e){} }
function removeRapidoPopup() { const p = document.getElementById('rapido-alert'); if (p) p.remove(); }

async function loadHistoryLogs() {
    if(!activeUser) return;
    try {
        const response = await fetch(`${BACKEND_URL}/history/${activeUser.user_id}`);
        const logs = await response.json();
        const container = activeUser.role === "DRIVER" ? document.getElementById('driverHistoryContainer') : document.getElementById('facultyHistoryContainer');
        if(!container) return;
        container.innerHTML = '';
        if(logs.length === 0) { container.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#64748b; padding:20px;">No records.</td></tr>`; return; }
        
        logs.forEach(l => {
            let row = document.createElement('tr');
            let statusColor = l.status === "COMPLETED" ? "#34d399" : (l.status === "ACCEPTED" ? "#fbbf24" : "#38bdf8");
            row.innerHTML = `<td>#00${l.ride_id}</td><td><b>${l.route}</b></td><td><b>${l.pilot}</b></td><td style="color:#f87171;">-${l.fare} PTS</td><td><span style="color:${statusColor}; font-weight:700;">${l.status}</span></td>`;
            container.appendChild(row);
        });
    } catch(e){}
}

async function refreshFacultyWallet() {
    if(!activeUser) return;
    try {
        const res = await fetch(`${BACKEND_URL}/auth/profile/${activeUser.user_id}`);
        const data = await res.json(); 
        activeUser.wallet_balance = data.wallet_balance;
        if(document.getElementById('facultyWallet')) {
            document.getElementById('facultyWallet').innerText = `${data.wallet_balance} PTS`;
        }
    } catch(e){}
}

setInterval(async () => {
    if (!activeUser) return; 

    if (activeUser.role === "DRIVER" && !radarLockActive) {
        try {
            const res = await fetch(`${BACKEND_URL}/driver/ping-ride/${activeUser.user_id}`);
            const data = await res.json();
            if (data.has_request) showRapidoPopup(data.ride_id, data.source, data.destination, data.passengers);
            else checkDriverRide();
        } catch(e){}
    }
    
    if (activeUser.role === "FACULTY") {
        try {
            loadHistoryLogs();
            refreshFacultyWallet();

            const card = document.getElementById('facultyStatusCard');
            if (card && card.style.display === "block") {
                const res = await fetch(`${BACKEND_URL}/history/${activeUser.user_id}`);
                const logs = await res.json();
                const activeRide = logs.find(l => l.status === "ACCEPTED" || l.status === "PENDING");
                
                if(activeRide) {
                    if(activeRide.status === "ACCEPTED" && activeRide.pilot !== "Searching Pilot...") {
                        card.style.background = "rgba(52, 211, 153, 0.1)"; card.style.color = "#34d399";
                        card.innerHTML = `✅ VEHICLE CAPTURED! VOLT SHUTTLE OPERATOR <b>${activeRide.pilot.toUpperCase()}</b> IS ON THE WAY TO YOUR BLOCK NOW! 🛺💨`;
                        localStorage.setItem('user_ride_state', 'ON_RIDE');
                    }
                } else {
                    if(localStorage.getItem('user_ride_state') === 'ON_RIDE') {
                        card.innerHTML = `🏁 RIDE COMPLETED SUCCESSFULLY! WELCOME TO YOUR DESTINATION BLOCK.`;
                        card.style.background = "rgba(16, 185, 129, 0.15)"; card.style.color = "#34d399";
                        localStorage.removeItem('user_ride_state');
                        setTimeout(() => { card.style.display = "none"; }, 4000);
                    } else {
                        card.style.display = "none";
                    }
                }
            }
        } catch(e){}
    }
}, 3000);

// Initial Load execution setup
window.onload = () => {
    loadBuildings();
};