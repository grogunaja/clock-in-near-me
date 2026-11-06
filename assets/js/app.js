// ==========================================
// 1. APPLICATION STATE
// (baseLocations is loaded from data.js)
// ==========================================
// Filter out any locations where status is 'N' or coordinates are missing
let locationsData = (typeof baseLocations !== 'undefined') 
    ? baseLocations.filter(loc => String(loc.status || 'Y').trim().toUpperCase() !== 'N' && loc.lat != null && loc.lng != null) 
    : [];

let userLocation = {
    lat: 13.757155,
    lng: 100.486346,
    accuracy: null,
    hasRealGPS: false,
    label: "กำลังจับพิกัดสด..."
};
let watchId = null;
let lastKnownHeroId = null;
let globalSlideIndex = 0; // 0 = image1 (อาคาร), 1 = image2 (จุดแตะบัตร)
let slideshowTimer = null;

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
// 4. IMAGE SLIDESHOW CONTROLLER (image1 <-> image2)
// ==========================================
function getSlideHTML(loc, isHero = false) {
    const img1 = loc.image1 || loc.image || '';
    const img2 = loc.image2 || '';
    const hasBoth = Boolean(img1 && img2);
    const key = isHero ? 'hero' : loc.id;
    const fallback = 'https://placehold.co/600x400/8338EC/FFFFFF?text=Check-in+Spot';

    if (!hasBoth) {
        return `
            <img 
                src="${img1 || fallback}" 
                alt="${loc.name}" 
                onerror="this.src='${fallback}'"
                class="w-full h-full object-cover group-hover:scale-105 transition duration-500"
            >
        `;
    }

    const isShowingImg1 = (globalSlideIndex === 0);

    return `
        <div class="slideshow-box relative w-full h-full cursor-pointer select-none group/slide" data-slide-id="${key}" onclick="toggleSlide('${key}')" title="คลิกเพื่อสลับรูปอาคาร / รูปจุดแตะบัตร">
            <!-- Slide Image 1 (Building) -->
            <img 
                id="slide-img1-${key}"
                src="${img1}" 
                alt="${loc.name} - รูปอาคาร" 
                onerror="this.src='${fallback}'"
                class="slide-img-1 absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out ${isShowingImg1 ? 'opacity-100' : 'opacity-0'}"
            >

            <!-- Slide Image 2 (Card Tap Machine) -->
            <img 
                id="slide-img2-${key}"
                src="${img2}" 
                alt="${loc.name} - รูปจุดแตะบัตรจริง" 
                onerror="this.src='https://placehold.co/600x400/FFD166/1E1B2E?text=จุดติดตั้งเครื่อง'"
                class="slide-img-2 absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out ${isShowingImg1 ? 'opacity-0' : 'opacity-100'}"
            >
        </div>
    `;
}

function updateSlideElement(key, slideIdx) {
    const img1 = document.getElementById(`slide-img1-${key}`);
    const img2 = document.getElementById(`slide-img2-${key}`);

    if (img1 && img2) {
        if (slideIdx === 0) {
            img1.classList.remove('opacity-0');
            img1.classList.add('opacity-100');
            img2.classList.remove('opacity-100');
            img2.classList.add('opacity-0');
        } else {
            img1.classList.remove('opacity-100');
            img1.classList.add('opacity-0');
            img2.classList.remove('opacity-0');
            img2.classList.add('opacity-100');
        }
    }
}

function toggleSlide(key) {
    const img1 = document.getElementById(`slide-img1-${key}`);
    if (!img1) return;
    const isShowingImg1 = img1.classList.contains('opacity-100');
    updateSlideElement(key, isShowingImg1 ? 1 : 0);
}

function startSlideshowTimer() {
    if (slideshowTimer) clearInterval(slideshowTimer);
    slideshowTimer = setInterval(() => {
        globalSlideIndex = (globalSlideIndex === 0) ? 1 : 0;
        document.querySelectorAll('.slideshow-box').forEach(box => {
            const key = box.getAttribute('data-slide-id');
            if (key) updateSlideElement(key, globalSlideIndex);
        });
    }, 3500); // changes every 3.5 seconds
}

// ==========================================
// 5. RENDERING HERO (NEAREST) & GRID CARDS
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
                <!-- Image Column with Slideshow -->
                <div class="lg:col-span-5 relative group">
                    <div class="h-52 sm:h-60 w-full rounded-2xl overflow-hidden border-[3px] border-pop-dark shadow-neo bg-slate-200 relative">
                        ${getSlideHTML(spot, true)}
                        <div class="absolute top-3 left-3 bg-pop-dark text-pop-yellow font-display font-bold text-xs px-3 py-1.5 rounded-xl border-2 border-white flex items-center gap-1.5 shadow-md pointer-events-none z-10">
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
                            <div class="flex items-center gap-2">
                                <i class="ph-fill ph-map-pin text-pop-purple text-lg shrink-0 mt-0.5"></i>
                                <div>
                                    <span class="font-bold text-pop-dark">จุดสแกน</span>
                                    <span class="text-slate-700"> ${spot.gateInfo}</span>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                <i class="ph-fill ph-clock text-pop-orange text-lg shrink-0"></i>
                                <div>
                                    <span class="font-bold text-pop-dark">เวลา</span>
                                    <span class="text-slate-700"> ${spot.openHours}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Single Primary Action Button: Google Maps -->
                    <div class="pt-1">
                        <a 
                            id="heroMapsLink"
                            href="${mapsUrl}" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            class="btn-neo w-full bg-pop-blue hover:bg-blue-600 text-white font-display font-bold py-3.5 px-5 rounded-2xl text-sm sm:text-base flex items-center justify-center gap-2 shadow-neo"
                        >
                            <i class="ph-bold ph-navigation-arrow text-xl"></i>
                            <span>นำทางด้วย Google Maps
                        </a>
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
                <!-- Top Image with Slideshow & Badges -->
                <div>
                    <div class="relative h-48 w-full bg-slate-100 border-b-[3px] border-pop-dark overflow-hidden group">
                        ${getSlideHTML(loc, false)}

                        <!-- Rank / Nearest Badge (Top Left) -->
                        <div class="absolute top-3 left-3 flex items-center gap-1.5 pointer-events-none z-10">
                            <span class="w-8 h-8 rounded-xl ${isNearest ? 'bg-pop-pink text-white' : 'bg-pop-yellow text-pop-dark'} border-2 border-pop-dark font-display font-bold text-xs flex items-center justify-center shadow-neo-sm">
                                #${index + 1}
                            </span>
                            ${isNearest ? `
                                <span class="bg-pop-pink text-white text-xs font-bold px-2.5 py-1 rounded-xl border-2 border-pop-dark shadow-neo-sm flex items-center gap-1">
                                    🔥 ใกล้สุด!
                                </span>
                            ` : ''}
                        </div>

                        <!-- Distance Meter Overlay (Bottom) -->
                        <div class="absolute bottom-3 left-3 right-3 flex items-center justify-between bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-xl border-2 border-pop-dark shadow-neo-sm pointer-events-none z-10">
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
                            <p class="text-slate-700 flex items-center gap-1.5">
                                <i class="ph-bold ph-map-pin text-pop-purple text-sm shrink-0 mt-0.5"></i>
                                <span><strong class="text-pop-dark">จุดสแกน</strong> ${loc.gateInfo}</span>
                            </p>
                            <p class="text-slate-600 flex items-center gap-1.5">
                                <i class="ph-bold ph-clock text-pop-orange text-sm shrink-0"></i>
                                <span><strong class="text-pop-dark">เวลา</strong> ${loc.openHours}</span>
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Card Footer Actions: Single Full-Width Maps Button -->
                <div class="px-4 pb-4 sm:px-5 sm:pb-5 pt-1">
                    <a 
                        href="${mapsUrl}" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        class="btn-neo w-full bg-pop-yellow hover:bg-[#ffc63b] text-pop-dark font-bold py-2.5 px-3 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-neo-sm"
                    >
                        <i class="ph-bold ph-navigation-arrow text-base"></i>
                        <span>นำทาง Google Maps</span>
                    </a>
                </div>
            </article>
        `;
    }).join('');
}

// ==========================================
// 6. SEARCH, TOAST & CLOCK HELPERS
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
    startLiveTracking();     // Continuous real-time GPS tracking
    startSlideshowTimer();   // Continuous automatic slideshow between image1 & image2
};
