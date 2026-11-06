// ==========================================
// 1. APPLICATION STATE
// (baseLocations is loaded from data.js)
// ==========================================
let locationsData = (typeof baseLocations !== 'undefined') ? [...baseLocations] : [];
let userLocation = {
    lat: 13.757155,
    lng: 100.486346,
    accuracy: null,
    hasRealGPS: false,
    label: "กำลังจับพิกัดสด..."
};
let watchId = null;
let activeModalLocationId = null;
let lastKnownHeroId = null;

// ==========================================
// 2. HAVERSINE DISTANCE CALCULATION (IN METERS)
// ==========================================
function calculateDistanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const toRad = (deg) => (deg * Math.PI) / 180;

    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1);
    const Δλ = toRad(lon2 - lon1);

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
}

function formatDistanceBadge(meters) {
    if (meters <= 15) {
        return `อยู่ที่นี่แล้ว (~${meters} ม.)`;
    } else if (meters < 1000) {
        return `ห่าง ${meters.toLocaleString('th-TH')} เมตร`;
    } else {
        const km = (meters / 1000).toFixed(1);
        return `ห่าง ${meters.toLocaleString('th-TH')} เมตร (${km} กม.)`;
    }
}

function getWalkingTimeText(meters) {
    if (meters <= 25) return "🎯 คุณอยู่ถึงจุดติดตั้งตึกนี้แล้ว!";
    if (meters <= 80) return "🏃 อยู่ใกล้มาก! เดินไม่ถึง 1 นาที";
    const mins = Math.ceil(meters / 80);
    if (mins <= 15) return `🚶 เดินเท้าประมาณ ${mins} นาทีถึง`;
    const driveMins = Math.max(2, Math.ceil(meters / 450));
    return `🛵 เดินทางประมาณ ${driveMins} นาที (${meters.toLocaleString('th-TH')} ม.)`;
}

function getGoogleMapsUrl(destLat, destLng, placeName) {
    return `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${destLat},${destLng}&travelmode=walking`;
}

// ==========================================
// 3. CONTINUOUS REAL-TIME GPS TRACKING
// ==========================================
function startLiveTracking() {
    const btnText = document.getElementById('btnFindGPSText');
    if (btnText) btnText.textContent = "กำลังค้นหา...";

    if (!navigator.geolocation) {
        updateGPSStatusUI('unsupported', 'ไม่รองรับ GPS');
        showGPSAlertBanner('เบราว์เซอร์ไม่รองรับ GPS', 'อุปกรณ์นี้ไม่รองรับระบบตรวจจับตำแหน่ง');
        showToast('⚠️ ไม่รองรับ GPS', 'อุปกรณ์นี้ไม่รองรับระบบตรวจจับตำแหน่ง');
        return;
    }

    updateGPSStatusUI('locating', 'กำลังค้นหาสัญญาณ...');

    const geoOptions = {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 12000
    };

    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }

    watchId = navigator.geolocation.watchPosition(
        onPositionSuccess,
        onPositionError,
        geoOptions
    );
}

function onPositionSuccess(position) {
    const realLat = position.coords.latitude;
    const realLng = position.coords.longitude;
    const accuracy = Math.round(position.coords.accuracy || 0);

    const isFirstFix = !userLocation.hasRealGPS;

    userLocation.lat = realLat;
    userLocation.lng = realLng;
    userLocation.accuracy = accuracy;
    userLocation.hasRealGPS = true;
    userLocation.label = `พิกัดจริง (±${accuracy} ม.)`;

    updateGPSStatusUI('active', `สดเรียลไทม์ (±${accuracy} ม.)`);
    hideGPSAlertBanner();

    if (isFirstFix) {
        showToast("🛰️ จับสัญญาณ GPS สดสำเร็จ!", "ระบบกำลังคำนวณและเรียงตึกตามระยะจริง");
    }

    // Recalculate distances and re-order in real time!
    recalculateAndRender();
}

function onPositionError(error) {
    console.warn('Geolocation watch error:', error);
    if (!userLocation.hasRealGPS) {
        if (error.code === error.PERMISSION_DENIED) {
            updateGPSStatusUI('denied', 'ยังไม่อนุญาต GPS');
            showGPSAlertBanner(
                'กรุณาเปิดสิทธิ์เข้าถึงตำแหน่ง (GPS)',
                'เพื่อให้ระบบคำนวณและเรียงลำดับตึกที่ใกล้ที่สุดแบบเรียลไทม์ขณะที่คุณเดิน'
            );
        } else {
            updateGPSStatusUI('error', 'ค้นหาสัญญาณไม่พบ');
        }
    }
}

function updateGPSStatusUI(status, label) {
    const zoneText = document.getElementById('currentZoneText');
    const indicator = document.getElementById('gpsLiveIndicator');
    const btnText = document.getElementById('btnFindGPSText');

    if (zoneText) zoneText.textContent = label;
    if (btnText) btnText.textContent = "จับพิกัดสด";

    if (indicator) {
        if (status === 'active') {
            indicator.innerHTML = `
                <span class="live-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            `;
        } else if (status === 'locating') {
            indicator.innerHTML = `
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            `;
        } else {
            indicator.innerHTML = `
                <span class="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
            `;
        }
    }
}

function showGPSAlertBanner(title, message) {
    const banner = document.getElementById('gpsAlertBanner');
    const titleEl = document.getElementById('gpsAlertTitle');
    const msgEl = document.getElementById('gpsAlertMessage');
    if (banner) {
        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = message;
        banner.classList.remove('hidden');
    }
}

function hideGPSAlertBanner() {
    const banner = document.getElementById('gpsAlertBanner');
    if (banner) banner.classList.add('hidden');
}

// ==========================================
// 4. RENDERING HERO (NEAREST) & GRID CARDS
// ==========================================
function recalculateAndRender() {
    // 1. Recalculate distance for each location using current userLocation
    locationsData.forEach(loc => {
        loc.distanceMeters = calculateDistanceInMeters(
            userLocation.lat,
            userLocation.lng,
            loc.lat,
            loc.lng
        );
    });

    // 2. Identify current nearest spot
    const sortedByNearest = [...locationsData].sort((a, b) => a.distanceMeters - b.distanceMeters);
    const nearestSpot = sortedByNearest[0];

    // 3. Render Hero card (closest building)
    renderNearestHero(nearestSpot);

    // 4. Filter & re-sort grid cards
    handleSearchAndFilter();

    // 5. If modal is currently open, update its distance live as well!
    if (activeModalLocationId !== null) {
        updateOpenModalDistance(activeModalLocationId);
    }
}

function renderNearestHero(spot) {
    if (!spot) return;

    const walkingEl = document.getElementById('walkingEstimate');
    if (walkingEl) walkingEl.textContent = getWalkingTimeText(spot.distanceMeters);

    const mapsUrl = getGoogleMapsUrl(spot.lat, spot.lng, spot.name);
    const container = document.getElementById('nearestCardContainer');

    // If the same building is still nearest, update distance elements directly to prevent image re-render
    if (lastKnownHeroId === spot.id && container.children.length > 0) {
        const distEl = document.getElementById('heroDistanceText');
        const mapsLinkEl = document.getElementById('heroMapsLink');
        if (distEl) distEl.textContent = formatDistanceBadge(spot.distanceMeters);
        if (mapsLinkEl) mapsLinkEl.href = mapsUrl;
        return;
    }

    lastKnownHeroId = spot.id;

    container.innerHTML = `
        <div class="card-neo bg-gradient-to-br from-pop-yellow via-[#FFE082] to-pop-mint/40 rounded-3xl p-4 sm:p-6 relative overflow-hidden transition-all duration-300">
            <!-- Decorative background sticker -->
            <div class="hidden sm:flex absolute -right-6 -bottom-6 w-36 h-36 rounded-full bg-white/30 border-2 border-pop-dark/10 items-center justify-center pointer-events-none"></div>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center relative z-10">
                <!-- Image Column -->
                <div class="lg:col-span-5 relative group">
                    <div class="h-52 sm:h-60 w-full rounded-2xl overflow-hidden border-[3px] border-pop-dark shadow-neo bg-slate-200 relative">
                        <img 
                            src="${spot.image}" 
                            alt="${spot.name}" 
                            onerror="this.src='https://placehold.co/600x400/FF5D8F/FFFFFF?text=Check-in+Spot'"
                            class="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                        >
                        <div class="absolute top-3 left-3 bg-pop-dark text-pop-yellow font-display font-bold text-xs px-3 py-1.5 rounded-xl border-2 border-white flex items-center gap-1.5 shadow-md">
                            <i class="ph-fill ph-crown text-base text-pop-yellow"></i>
                            <span>อันดับ #1 ใกล้คุณที่สุด</span>
                        </div>
                    </div>
                </div>

                <!-- Details Column -->
                <div class="lg:col-span-7 flex flex-col justify-between space-y-4">
                    <div class="space-y-2">
                        <!-- Giant Distance Meter Pill -->
                        <div class="inline-flex flex-wrap items-center gap-2">
                            <span class="bg-pop-pink text-white font-display font-bold text-lg sm:text-2xl px-4 py-1.5 rounded-2xl border-[2.5px] border-pop-dark shadow-neo-sm flex items-center gap-2">
                                <i class="ph-fill ph-map-pin-area"></i>
                                <span id="heroDistanceText">${formatDistanceBadge(spot.distanceMeters)}</span>
                            </span>
                        </div>

                        <h3 class="font-display text-2xl sm:text-3xl font-bold text-pop-dark pt-1">
                            ${spot.name}
                        </h3>

                        <div class="bg-white/90 rounded-2xl p-3.5 border-2 border-pop-dark space-y-1.5 text-xs sm:text-sm">
                            <div class="flex items-start gap-2">
                                <i class="ph-fill ph-door-open text-pop-purple text-lg shrink-0 mt-0.5"></i>
                                <div>
                                    <span class="font-bold text-pop-dark">จุดตั้งเครื่องแตะบัตร:</span>
                                    <span class="text-slate-700"> ${spot.gateInfo}</span>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                <i class="ph-fill ph-clock text-pop-orange text-lg shrink-0"></i>
                                <div>
                                    <span class="font-bold text-pop-dark">เวลาเปิดอาคาร/จุดสแกน:</span>
                                    <span class="text-slate-700"> ${spot.openHours}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex flex-col sm:flex-row gap-3 pt-1">
                        <a 
                            id="heroMapsLink"
                            href="${mapsUrl}" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            class="btn-neo flex-1 bg-pop-blue hover:bg-blue-600 text-white font-display font-bold py-3.5 px-5 rounded-2xl text-sm sm:text-base flex items-center justify-center gap-2"
                        >
                            <i class="ph-bold ph-google-logo text-xl"></i>
                            <span>นำทางด้วย Google Maps</span>
                            <i class="ph-bold ph-arrow-up-right"></i>
                        </a>

                        <button 
                            onclick="openTapModal(${spot.id})"
                            class="btn-neo bg-white hover:bg-pop-mint text-pop-dark font-display font-bold py-3.5 px-5 rounded-2xl text-sm sm:text-base flex items-center justify-center gap-2"
                        >
                            <i class="ph-fill ph-info text-xl text-pop-purple"></i>
                            <span>ดูจุดสังเกตที่ตั้งเครื่อง</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function handleSearchAndFilter() {
    const query = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
    const sortMode = document.getElementById('sortSelect')?.value || 'distance-asc';
    const clearBtn = document.getElementById('clearSearchBtn');

    if (clearBtn) {
        if (query.length > 0) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    }

    // Filter by search query (name and gateInfo)
    let filtered = locationsData.filter(loc => {
        const matchesQuery = !query || 
            loc.name.toLowerCase().includes(query) ||
            loc.gateInfo.toLowerCase().includes(query);
        
        const matchesWalkable = (sortMode === 'walkable') ? loc.distanceMeters <= 200 : true;

        return matchesQuery && matchesWalkable;
    });

    // Sort
    if (sortMode === 'name-asc') {
        filtered.sort((a, b) => a.name.localeCompare(b.name, 'th'));
    } else {
        // distance-asc or walkable
        filtered.sort((a, b) => a.distanceMeters - b.distanceMeters);
    }

    renderLocationsGrid(filtered);
}

function renderLocationsGrid(list) {
    const grid = document.getElementById('locationsGrid');
    const emptyState = document.getElementById('emptyState');
    const countText = document.getElementById('resultCountText');

    if (countText) {
        countText.textContent = `แสดง ${list.length} สถานที่`;
    }

    if (!grid) return;

    if (list.length === 0) {
        grid.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    // Overall nearest ID to badge with 🔥 ใกล้สุด!
    const overallNearestId = [...locationsData].sort((a, b) => a.distanceMeters - b.distanceMeters)[0]?.id;

    grid.innerHTML = list.map((loc, index) => {
        const isNearest = loc.id === overallNearestId;
        const mapsUrl = getGoogleMapsUrl(loc.lat, loc.lng, loc.name);

        return `
            <article class="card-neo bg-white rounded-3xl overflow-hidden flex flex-col justify-between relative transition-all duration-300" data-id="${loc.id}">
                <!-- Top Image & Badges -->
                <div>
                    <div class="relative h-44 w-full bg-slate-100 border-b-[3px] border-pop-dark overflow-hidden group">
                        <img 
                            src="${loc.image}" 
                            alt="${loc.name}" 
                            onerror="this.src='https://placehold.co/600x400/8338EC/FFFFFF?text=Check-in+Spot'"
                            class="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                        >
                        <!-- Rank / Nearest Badge -->
                        <div class="absolute top-3 left-3 flex items-center gap-1.5">
                            <span class="w-8 h-8 rounded-xl ${isNearest ? 'bg-pop-pink text-white' : 'bg-pop-yellow text-pop-dark'} border-2 border-pop-dark font-display font-bold text-xs flex items-center justify-center shadow-neo-sm">
                                #${index + 1}
                            </span>
                            ${isNearest ? `
                                <span class="bg-pop-pink text-white text-xs font-bold px-2.5 py-1 rounded-xl border-2 border-pop-dark shadow-neo-sm flex items-center gap-1">
                                    🔥 ใกล้สุด!
                                </span>
                            ` : ''}
                        </div>

                        <!-- Distance Meter Overlay -->
                        <div class="absolute bottom-3 left-3 right-3 flex items-center justify-between bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-xl border-2 border-pop-dark shadow-neo-sm">
                            <div class="flex items-center gap-1.5 text-pop-dark font-display font-bold text-sm">
                                <i class="ph-fill ph-footprints text-pop-pink text-base"></i>
                                <span class="dist-val">${loc.distanceMeters.toLocaleString('th-TH')} เมตร</span>
                            </div>
                            <span class="text-[11px] font-semibold text-slate-500">
                                ${loc.distanceMeters < 1000 ? 'ระยะเดินถึง' : (loc.distanceMeters / 1000).toFixed(1) + ' กม.'}
                            </span>
                        </div>
                    </div>

                    <!-- Card Body -->
                    <div class="p-4 sm:p-5 space-y-3">
                        <h3 class="font-display text-lg font-bold text-pop-dark leading-snug line-clamp-1" title="${loc.name}">
                            ${loc.name}
                        </h3>

                        <div class="bg-pop-bg rounded-xl p-3 border-2 border-pop-dark/80 space-y-1.5 text-xs">
                            <p class="text-slate-700 flex items-start gap-1.5">
                                <i class="ph-bold ph-map-pin text-pop-purple text-sm shrink-0 mt-0.5"></i>
                                <span><strong class="text-pop-dark">จุดสแกน:</strong> ${loc.gateInfo}</span>
                            </p>
                            <p class="text-slate-600 flex items-center gap-1.5">
                                <i class="ph-bold ph-clock text-pop-orange text-sm shrink-0"></i>
                                <span><strong class="text-pop-dark">เวลา:</strong> ${loc.openHours}</span>
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Card Footer Actions -->
                <div class="px-4 pb-4 sm:px-5 sm:pb-5 pt-1 flex items-center gap-2.5">
                    <a 
                        href="${mapsUrl}" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        class="btn-neo flex-1 bg-pop-yellow hover:bg-[#ffc63b] text-pop-dark font-bold py-2.5 px-3 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-1.5"
                    >
                        <i class="ph-bold ph-navigation-arrow text-base"></i>
                        <span>นำทาง Google Maps</span>
                    </a>
                    <button 
                        onclick="openTapModal(${loc.id})"
                        title="ดูจุดสังเกตที่ตั้งเครื่องแตะบัตร"
                        class="btn-neo bg-white hover:bg-pop-mint text-pop-dark font-bold p-2.5 rounded-xl text-sm flex items-center justify-center shrink-0"
                    >
                        <i class="ph-bold ph-info text-lg"></i>
                    </button>
                </div>
            </article>
        `;
    }).join('');
}

// ==========================================
// 5. MODAL, TOAST & UI HELPERS
// ==========================================
function clearSearch() {
    const input = document.getElementById('searchInput');
    if (input) input.value = '';
    handleSearchAndFilter();
}

function resetAllFilters() {
    const input = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    if (input) input.value = '';
    if (sortSelect) sortSelect.value = 'distance-asc';
    handleSearchAndFilter();
}

function openTapModal(locationId) {
    activeModalLocationId = locationId;
    const spot = locationsData.find(l => l.id === locationId);
    if (!spot) return;

    document.getElementById('modalLocationName').textContent = spot.name;
    document.getElementById('modalGate').textContent = spot.gateInfo;
    document.getElementById('modalOpenHours').textContent = spot.openHours;
    updateOpenModalDistance(locationId);

    const modal = document.getElementById('tapModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function updateOpenModalDistance(locationId) {
    const spot = locationsData.find(l => l.id === locationId);
    if (!spot) return;

    const distEl = document.getElementById('modalDistanceInfo');
    const mapLinkEl = document.getElementById('modalMapLink');
    if (distEl) {
        distEl.textContent = `ระยะห่างจากคุณ: ${spot.distanceMeters.toLocaleString('th-TH')} เมตร`;
    }
    if (mapLinkEl) {
        mapLinkEl.href = getGoogleMapsUrl(spot.lat, spot.lng, spot.name);
    }
}

function closeTapModal() {
    activeModalLocationId = null;
    const modal = document.getElementById('tapModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

let toastTimeout;
function showToast(title, message) {
    const toast = document.getElementById('toastBox');
    if (!toast) return;

    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastMessage').textContent = message;

    toast.classList.remove('translate-y-28', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-28', 'opacity-0');
    }, 3200);
}

// Live Clock in Top Bar
function startClock() {
    const clockEl = document.getElementById('liveClock');
    if (!clockEl) return;
    const update = () => {
        const now = new Date();
        clockEl.textContent = "🕒 " + now.toLocaleTimeString('th-TH', { hour12: false });
    };
    update();
    setInterval(update, 1000);
}

// Initialize on Window Load
window.onload = function () {
    startClock();
    recalculateAndRender();
    startLiveTracking(); // Automatically start continuous real-time tracking
};
