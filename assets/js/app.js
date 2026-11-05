// ==========================================
// 1. APPLICATION STATE
// (baseLocations is loaded from data.js)
// ==========================================
let locationsData = (typeof baseLocations !== 'undefined') ? [...baseLocations] : [];
let userLocation = {
    lat: 13.7574,
    lng: 100.4857,
    label: "ลานพระราชานุสาวรีย์ฯ"
};
let activeCategory = "all";

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

    return Math.round(R * c); // Exact meters rounded to integer
}

// Format meters with commas and helpful km subtitle if far
function formatDistanceBadge(meters) {
    if (meters < 1000) {
        return `ห่าง ${meters.toLocaleString('th-TH')} เมตร`;
    } else {
        const km = (meters / 1000).toFixed(1);
        return `ห่าง ${meters.toLocaleString('th-TH')} เมตร (${km} กม.)`;
    }
}

// Estimate walking time (approx 80 meters per minute)
function getWalkingTimeText(meters) {
    if (meters <= 80) return "🏃 อยู่ใกล้มาก! เดินไม่ถึง 1 นาที";
    const mins = Math.ceil(meters / 80);
    if (mins <= 15) return `🚶 เดินเท้าประมาณ ${mins} นาทีถึง`;
    const driveMins = Math.max(3, Math.ceil(meters / 450));
    return `🛵 เดินทางประมาณ ${driveMins} นาที (${meters.toLocaleString('th-TH')} ม.)`;
}

// Generate Google Maps Direction URL
function getGoogleMapsUrl(destLat, destLng, placeName) {
    return `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${destLat},${destLng}&travelmode=walking`;
}

// ==========================================
// 3. REAL GPS & SIMULATED PRESET HANDLERS
// ==========================================
function requestRealGPS() {
    const btn = document.getElementById('btnFindGPS');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `<i class="ph-bold ph-spinner animate-spin text-lg"></i><span>กำลังค้นหาพิกัด...</span>`;
    btn.disabled = true;

    if (!navigator.geolocation) {
        showToast("⚠️ เบราว์เซอร์ไม่รองรับ GPS", "ระบบใช้พิกัดจำลองแทนนะครับ");
        resetGPSButton(btn, originalHTML);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const realLat = position.coords.latitude;
            const realLng = position.coords.longitude;

            userLocation = {
                lat: realLat,
                lng: realLng,
                label: `พิกัด GPS ปัจจุบัน (${realLat.toFixed(4)}, ${realLng.toFixed(4)})`
            };

            // Ensure there is always a local check-in point near the user's real GPS
            // so they can test realistic short meter distances anywhere in the world!
            injectNearbyPopUpSpotIfFar(realLat, realLng);

            // Clear preset active styling
            document.querySelectorAll('.preset-btn').forEach(b => {
                b.classList.remove('bg-pop-yellow');
                b.classList.add('bg-white');
            });

            document.getElementById('currentZoneText').textContent = "พิกัด GPS จริงของคุณ";
            recalculateAndRender();
            showToast("🛰️ จับพิกัด GPS สำเร็จ!", "คำนวณจุดแตะบัตรที่ใกล้คุณที่สุดแล้ว");
            resetGPSButton(btn, originalHTML);
        },
        (error) => {
            // Fallback: create a realistic local spot near current simulated location
            showToast("📍 ใช้โหมดพิกัดจำลอง", "คุณสามารถเลือกย่านด้านล่างเพื่อทดสอบระยะทางได้ทันที");
            resetGPSButton(btn, originalHTML);
        },
        { enableHighAccuracy: true, timeout: 7000 }
    );
}

function resetGPSButton(btn, html) {
    btn.innerHTML = html;
    btn.disabled = false;
}

// If user tests real GPS while outside Siriraj Hospital (>1.5km away), keep all Siriraj buildings so they can see exact distances to Siriraj
function injectNearbyPopUpSpotIfFar(lat, lng) {
    locationsData = [...baseLocations];
}

function setSimulatedLocation(lat, lng, label, presetKey) {
    locationsData = [...baseLocations];
    userLocation = { lat, lng, label };
    document.getElementById('currentZoneText').textContent = label;

    // Highlight active preset button
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.remove('bg-pop-yellow');
        btn.classList.add('bg-white');
    });
    const activeBtn = document.getElementById(`preset-${presetKey}`);
    if (activeBtn) {
        activeBtn.classList.remove('bg-white');
        activeBtn.classList.add('bg-pop-yellow');
    }

    recalculateAndRender();
    showToast("📍 ย้ายพิกัดจำลองแล้ว!", `กำลังแสดงจุดแตะบัตรรอบ "${label}"`);
}

// ==========================================
// 4. RENDERING HERO (NEAREST) & GRID CARDS
// ==========================================
function recalculateAndRender() {
    // Compute distance for every location
    locationsData.forEach(loc => {
        loc.distanceMeters = calculateDistanceInMeters(
            userLocation.lat,
            userLocation.lng,
            loc.lat,
            loc.lng
        );
    });

    // Find overall nearest location
    const sortedByNearest = [...locationsData].sort((a, b) => a.distanceMeters - b.distanceMeters);
    const nearestSpot = sortedByNearest[0];

    renderNearestHero(nearestSpot);
    handleSearchAndFilter();
    updateCategoryCounts();
}

function renderNearestHero(spot) {
    if (!spot) return;

    document.getElementById('walkingEstimate').textContent = getWalkingTimeText(spot.distanceMeters);
    const mapsUrl = getGoogleMapsUrl(spot.lat, spot.lng, spot.name);

    const container = document.getElementById('nearestCardContainer');
    container.innerHTML = `
        <div class="card-neo bg-gradient-to-br from-pop-yellow via-[#FFE082] to-pop-mint/40 rounded-3xl p-4 sm:p-6 relative overflow-hidden">
            <!-- Decorative background sticker -->
            <div class="hidden sm:flex absolute -right-6 -bottom-6 w-36 h-36 rounded-full bg-white/30 border-2 border-pop-dark/10 items-center justify-center pointer-events-none"></div>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center relative z-10">
                <!-- Image Column -->
                <div class="lg:col-span-5 relative group">
                    <div class="h-52 sm:h-60 w-full rounded-2xl overflow-hidden border-[3px] border-pop-dark shadow-neo bg-slate-200 relative">
                        <img 
                            src="${spot.image}" 
                            alt="${spot.name}" 
                            onerror="this.src='https://placehold.co/600x400/FF5D8F/FFFFFF?text=Tap+Card+Spot'"
                            class="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                        >
                        <div class="absolute top-3 left-3 bg-pop-dark text-pop-yellow font-display font-bold text-xs px-3 py-1.5 rounded-xl border-2 border-white flex items-center gap-1.5 shadow-md">
                            <i class="ph-fill ph-crown text-base"></i>
                            <span>อันดับ #1 ใกล้คุณที่สุด</span>
                        </div>
                        <div class="absolute bottom-3 right-3 bg-white/95 backdrop-blur-sm text-pop-dark font-bold text-xs px-3 py-1 rounded-lg border-2 border-pop-dark">
                            ${spot.category}
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
                                ${formatDistanceBadge(spot.distanceMeters)}
                            </span>
                            <span class="bg-white text-pop-dark font-bold text-xs px-3 py-1.5 rounded-xl border-2 border-pop-dark flex items-center gap-1.5">
                                <i class="ph-fill ph-identification-card text-pop-purple text-base"></i>
                                ต้องใช้บัตรแตะที่เครื่องจริง
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
    const query = document.getElementById('searchInput').value.trim().toLowerCase();
    const sortMode = document.getElementById('sortSelect').value;
    const clearBtn = document.getElementById('clearSearchBtn');

    if (query.length > 0) {
        clearBtn.classList.remove('hidden');
    } else {
        clearBtn.classList.add('hidden');
    }

    // Filter by search & category
    let filtered = locationsData.filter(loc => {
        const matchesQuery = 
            loc.name.toLowerCase().includes(query) ||
            loc.gateInfo.toLowerCase().includes(query) ||
            loc.category.toLowerCase().includes(query);
        
        const matchesCat = (activeCategory === 'all') || (loc.category === activeCategory);
        const matchesWalkable = (sortMode === 'walkable') ? loc.distanceMeters <= 200 : true;

        return matchesQuery && matchesCat && matchesWalkable;
    });

    // Sort
    if (sortMode === 'name-asc') {
        filtered.sort((a, b) => a.name.localeCompare(b.name, 'th'));
    } else {
        filtered.sort((a, b) => a.distanceMeters - b.distanceMeters);
    }

    renderLocationsGrid(filtered);
}

function renderLocationsGrid(list) {
    const grid = document.getElementById('locationsGrid');
    const emptyState = document.getElementById('emptyState');
    const countText = document.getElementById('resultCountText');

    countText.textContent = `แสดง ${list.length} สถานที่`;

    if (list.length === 0) {
        grid.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    // Find overall nearest ID so we can badge it in the grid too
    const overallNearestId = [...locationsData].sort((a, b) => a.distanceMeters - b.distanceMeters)[0]?.id;

    grid.innerHTML = list.map((loc, index) => {
        const isNearest = loc.id === overallNearestId;
        const mapsUrl = getGoogleMapsUrl(loc.lat, loc.lng, loc.name);

        return `
            <article class="card-neo bg-white rounded-3xl overflow-hidden flex flex-col justify-between relative">
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

                        <!-- Category Tag -->
                        <span class="absolute top-3 right-3 ${loc.badgeColor} text-[11px] font-bold px-2.5 py-1 rounded-full border-2 border-pop-dark shadow-neo-sm">
                            ${loc.category}
                        </span>

                        <!-- Distance Meter Overlay -->
                        <div class="absolute bottom-3 left-3 right-3 flex items-center justify-between bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-xl border-2 border-pop-dark shadow-neo-sm">
                            <div class="flex items-center gap-1.5 text-pop-dark font-display font-bold text-sm">
                                <i class="ph-fill ph-footprints text-pop-pink text-base"></i>
                                <span>${loc.distanceMeters.toLocaleString('th-TH')} เมตร</span>
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
// 5. FILTER, MODAL & UI HELPERS
// ==========================================
function setCategory(cat) {
    activeCategory = cat;
    document.querySelectorAll('.cat-pill').forEach(btn => {
        if (btn.getAttribute('data-cat') === cat) {
            btn.classList.remove('bg-white', 'text-pop-dark');
            btn.classList.add('bg-pop-dark', 'text-white');
        } else {
            btn.classList.remove('bg-pop-dark', 'text-white');
            btn.classList.add('bg-white', 'text-pop-dark');
        }
    });
    handleSearchAndFilter();
}

function updateCategoryCounts() {
    const countAll = document.getElementById('count-all');
    if (countAll) countAll.textContent = locationsData.length;
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    handleSearchAndFilter();
}

function resetAllFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('sortSelect').value = 'distance-asc';
    setCategory('all');
}

function openTapModal(locationId) {
    const spot = locationsData.find(l => l.id === locationId);
    if (!spot) return;

    document.getElementById('modalLocationName').textContent = spot.name;
    document.getElementById('modalDistanceInfo').textContent = `ห่างจากพิกัดของคุณ ${spot.distanceMeters.toLocaleString('th-TH')} เมตร`;
    document.getElementById('modalGate').textContent = spot.gateInfo;
    document.getElementById('modalOpenHours').textContent = spot.openHours;
    document.getElementById('modalMapLink').href = getGoogleMapsUrl(spot.lat, spot.lng, spot.name);

    const modal = document.getElementById('tapModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeTapModal() {
    const modal = document.getElementById('tapModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

let toastTimeout;
function showToast(title, message) {
    const toast = document.getElementById('toastBox');
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
};

