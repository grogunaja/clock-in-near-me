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

// Map & View State (Google Maps)
let currentView = 'list'; // 'list' | 'map'
let googleMap = null;
let gMarkers = [];
let userGMarker = null;
let userGCircle = null;
let activeInfoWindow = null;

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
    if (meters <= 25) return "🎯 ถึงแล้ว!";
    if (meters <= 80) return "🏃 เดิน < 1 นาที";
    const mins = Math.ceil(meters / 80);
    if (mins <= 15) return `🚶 เดิน ~${mins} นาที`;
    const driveMins = Math.max(2, Math.ceil(meters / 450));
    return `🛵 นั่งรถ ~${driveMins} นาที`;
}

function getGoogleMapsUrl(destLat, destLng, placeName) {
    return `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${destLat},${destLng}&travelmode=walking`;
}

// Analytics Event Tracking Helper
function trackMapsClick(buildingName, isHero = false) {
    if (typeof gtag === 'function') {
        gtag('event', 'click_navigation', {
            building_name: buildingName,
            card_type: isHero ? 'hero_nearest' : 'grid_list'
        });
    }
}

// ==========================================
// 3. CONTINUOUS REAL-TIME GPS TRACKING
// ==========================================
function startLiveTracking() {
    if (!navigator.geolocation) {
        showGPSAlertBanner('เบราว์เซอร์ไม่รองรับ GPS', 'อุปกรณ์นี้ไม่รองรับระบบตรวจจับตำแหน่ง');
        showToast('⚠️ ไม่รองรับ GPS', 'อุปกรณ์นี้ไม่รองรับระบบตรวจจับตำแหน่ง');
        return;
    }

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

    hideGPSAlertBanner();

    if (isFirstFix) {
        showToast("🛰️ จับสัญญาณ GPS สดสำเร็จ!", "ระบบกำลังคำนวณและเรียงตึกตามระยะจริง");
        if (typeof gtag === 'function') {
            gtag('event', 'gps_connected', { accuracy_meters: accuracy });
        }
    }

    // Recalculate distances and re-order in real time!
    recalculateAndRender();

    // Update user marker on interactive map
    if (googleMap) updateUserGoogleMapPosition();
}

function onPositionError(error) {
    console.warn('Geolocation watch error:', error);
    if (!userLocation.hasRealGPS && error.code === error.PERMISSION_DENIED) {
        showGPSAlertBanner(
            'กรุณาเปิดสิทธิ์เข้าถึงตำแหน่ง (GPS)',
            'เพื่อให้ระบบคำนวณและเรียงลำดับตึกที่ใกล้ที่สุดแบบเรียลไทม์ขณะที่คุณเดิน'
        );
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
        banner.removeAttribute('hidden');
    }
}

function hideGPSAlertBanner() {
    const banner = document.getElementById('gpsAlertBanner');
    if (banner) {
        banner.classList.add('hidden');
        banner.setAttribute('hidden', '');
    }
}

// ==========================================
// 4. IMAGE SLIDESHOW CONTROLLER (image1 <-> image2)
// ==========================================
function getSlideHTML(loc, isHero = false) {
    const img1 = loc.image1 || loc.image || '';
    const img2 = loc.image2 || '';
    const hasBoth = Boolean(img1 && img2);
    const key = isHero ? 'hero' : loc.id;
    const fallback = 'assets/images/noimage.jpg';

    if (!hasBoth) {
        return `
            <img 
                src="${img1 || img2 || fallback}" 
                alt="${loc.name}" 
                onerror="this.src='${fallback}'"
                class="w-full h-full object-cover group-hover:scale-105 transition duration-500"
            >
        `;
    }

    const isShowingImg1 = (globalSlideIndex === 0);

    return `
        <div class="slideshow-box relative w-full h-full select-none" data-slide-id="${key}">
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
                onerror="this.src='${fallback}'"
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
                    </div>
                </div>

                <!-- Details Column -->
                <div class="lg:col-span-7 flex flex-col justify-between space-y-4">
                    <div class="space-y-2">
                        <!-- Giant Distance Meter Pill -->
                        <div class="inline-flex flex-wrap items-center gap-2">
                            <span class="badge-neo bg-pop-pink text-white font-display font-semibold text-lg sm:text-2xl px-4 py-1.5 flex items-center gap-2">
                                <i class="ph-fill ph-map-pin-area"></i>
                                <span id="heroDistanceText">${formatDistanceBadge(spot.distanceMeters)}</span>
                            </span>
                        </div>

                        <h3 class="font-display text-2xl sm:text-3xl font-semibold text-pop-dark pt-1">
                            ${spot.name}
                        </h3>

                        <div class="bg-white/90 rounded-2xl p-3.5 border-2 border-pop-dark text-sm sm:text-base">
                            <div class="flex items-center gap-2">
                                <i class="ph-fill ph-map-pin text-pop-purple text-lg shrink-0"></i>
                                <div>
                                    <span class="font-semibold text-pop-dark">${spot.gateInfo}</span>
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
                            onclick="trackMapsClick('${spot.name}', true)"
                            class="btn-neo btn-blue w-full font-display font-semibold py-3.5 px-5 rounded-2xl text-sm sm:text-base flex items-center justify-center gap-2 shadow-neo"
                        >
                            <i class="ph-bold ph-navigation-arrow text-xl"></i>
                            <span>นำทางด้วย Google Maps</span>
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
    if (googleMap) renderGoogleMapPins(filtered);
    setTimeout(adjustFloatingButtonPosition, 60);
}

function renderLocationsGrid(list) {
    const grid = document.getElementById('locationsGrid');
    const emptyState = document.getElementById('emptyState');
    const countText = document.getElementById('resultCountText');
    const headerBar = document.getElementById('locationsHeaderBar');
    const floatingToggle = document.getElementById('floatingToggleWrapper');
    const mapContainer = document.getElementById('mapViewContainer');

    if (countText) {
        countText.textContent = `${list.length} สถานที่`;
    }

    if (!grid) return;

    if (list.length === 0) {
        grid.innerHTML = '';
        if (headerBar) headerBar.classList.add('hidden');
        if (floatingToggle) floatingToggle.classList.add('hidden');
        if (mapContainer) mapContainer.classList.add('hidden');
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    // Has results: reveal header, tabs & floating toggle
    if (headerBar) headerBar.classList.remove('hidden');
    if (floatingToggle) floatingToggle.classList.remove('hidden');
    if (emptyState) emptyState.classList.add('hidden');

    if (currentView === 'map') {
        grid.classList.add('hidden');
        if (mapContainer) mapContainer.classList.remove('hidden');
    } else {
        grid.classList.remove('hidden');
        if (mapContainer) mapContainer.classList.add('hidden');
    }

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
                            <span class="w-8 h-8 rounded-xl ${isNearest ? 'bg-pop-pink text-white' : 'bg-pop-yellow text-pop-dark'} border-2 border-pop-dark font-display font-semibold text-xs flex items-center justify-center shadow-neo-sm">
                                #${index + 1}
                            </span>
                            ${isNearest ? `
                                <span class="bg-pop-pink text-white text-xs font-semibold px-2.5 py-1 rounded-xl border-2 border-pop-dark shadow-neo-sm flex items-center gap-1">
                                    🔥 ใกล้สุด!
                                </span>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Card Body -->
                    <div class="p-4 sm:p-5 space-y-2.5">
                        <!-- Distance Meter Box (Above building name) -->
                        <div class="flex items-center justify-between bg-pop-bg px-3 py-1.5 rounded-xl border-2 border-pop-dark shadow-neo-sm">
                            <div class="flex items-center gap-1.5 text-pop-dark font-display font-semibold text-xs sm:text-sm">
                                <i class="ph-fill ph-footprints text-pop-pink text-base"></i>
                                <span class="dist-val">${loc.distanceMeters.toLocaleString('th-TH')} เมตร</span>
                            </div>
                            <span class="text-[11px] font-semibold text-slate-500">
                                ${loc.distanceMeters < 1000 ? 'ระยะเดินถึง' : (loc.distanceMeters / 1000).toFixed(1) + ' กม.'}
                            </span>
                        </div>

                        <!-- Building Name & Scan Location (Tightly grouped) -->
                        <div class="space-y-0.5">
                            <h3 class="font-display text-lg font-semibold text-pop-dark leading-snug line-clamp-1" title="${loc.name}">
                                ${loc.name}
                            </h3>

                            <p class="text-slate-700 flex items-center gap-1.5 text-sm">
                                <i class="ph-bold ph-map-pin text-pop-purple text-base shrink-0"></i>
                                <span>${loc.gateInfo}</span>
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
                        onclick="trackMapsClick('${loc.name}', false)"
                        class="btn-neo btn-yellow w-full font-semibold py-2.5 px-3 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-neo-sm"
                    >
                        <i class="ph-bold ph-navigation-arrow text-base"></i>
                        <span>นำทางด้วย Google Maps</span>
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

// ==========================================
// 7. INTERACTIVE MAP CONTROLLER (GOOGLE MAPS)
// ==========================================

// Custom SVG Pin Data URIs for crisp rendering across all screen resolutions
const NEAREST_PIN_SVG = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="58" viewBox="0 0 48 58">
  <defs>
    <filter id="shadowHot" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#FF5D8F" flood-opacity="0.5"/>
    </filter>
  </defs>
  <path d="M24 2C12.95 2 4 10.95 4 22c0 14.2 18.2 30.5 19 31.2a1.5 1.5 0 0 0 2 0C25.8 52.5 44 36.2 44 22 44 10.95 35.05 2 24 2z" fill="#FF5D8F" stroke="#FFFFFF" stroke-width="2" filter="url(#shadowHot)"/>
  <circle cx="24" cy="21" r="13" fill="#FFFFFF"/>
  <text x="24" y="27" font-size="15" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif">🔥</text>
</svg>
`);

const STANDARD_PIN_SVG = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50">
  <defs>
    <filter id="shadowStd" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#5C3D2E" flood-opacity="0.25"/>
    </filter>
  </defs>
  <path d="M20 2C10.6 2 3 9.6 3 19c0 12.2 15.5 26.2 16.2 26.8a1.3 1.3 0 0 0 1.6 0C21.5 45.2 37 31.2 37 19 37 9.6 29.4 2 20 2z" fill="#FFB703" stroke="#FFFFFF" stroke-width="2" filter="url(#shadowStd)"/>
  <circle cx="20" cy="18" r="11" fill="#FFFFFF"/>
  <text x="20" y="23" font-size="13" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif">📍</text>
</svg>
`);

const USER_PIN_SVG = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
  <circle cx="18" cy="18" r="16" fill="#0EA5E9" fill-opacity="0.25"/>
  <circle cx="18" cy="18" r="9" fill="#0284C7" stroke="#FFFFFF" stroke-width="2.5"/>
</svg>
`);

function switchView(viewMode) {
    currentView = viewMode;
    const listGrid = document.getElementById('locationsGrid');
    const emptyState = document.getElementById('emptyState');
    const mapContainer = document.getElementById('mapViewContainer');

    const listBtn = document.getElementById('viewListBtn');
    const mapBtn = document.getElementById('viewMapBtn');
    const floatIcon = document.getElementById('floatingToggleIcon');
    const floatText = document.getElementById('floatingToggleText');

    if (viewMode === 'map') {
        if (listGrid) listGrid.classList.add('hidden');
        if (emptyState) emptyState.classList.add('hidden');
        if (mapContainer) mapContainer.classList.remove('hidden');

        // Update Top Switcher Buttons (Neo-pop themed)
        if (listBtn) listBtn.className = "tab-btn-inactive";
        if (mapBtn) mapBtn.className = "tab-btn-active";

        // Update Floating Button Text & Icon
        if (floatIcon) floatIcon.className = "ph-bold ph-list-dashes text-lg";
        if (floatText) floatText.textContent = "ดูรายการ";

        // Initialize or refresh Google Map
        if (!googleMap) {
            if (typeof google !== 'undefined' && google.maps) {
                initGoogleMap();
            }
        } else {
            setTimeout(() => {
                google.maps.event.trigger(googleMap, 'resize');
                if (userLocation.hasRealGPS) {
                    googleMap.panTo({ lat: userLocation.lat, lng: userLocation.lng });
                }
            }, 100);
        }

        if (typeof gtag === 'function') {
            gtag('event', 'switch_view', { view_mode: 'map' });
        }
    } else {
        // 'list' view
        if (listGrid) listGrid.classList.remove('hidden');
        if (mapContainer) mapContainer.classList.add('hidden');

        // Update Top Switcher Buttons (Neo-pop themed)
        if (listBtn) listBtn.className = "tab-btn-active";
        if (mapBtn) mapBtn.className = "tab-btn-inactive";

        // Update Floating Button Text & Icon
        if (floatIcon) floatIcon.className = "ph-bold ph-map-trifold text-lg";
        if (floatText) floatText.textContent = "ดูแผนที่";

        if (typeof gtag === 'function') {
            gtag('event', 'switch_view', { view_mode: 'list' });
        }
    }

    // Readjust floating button position when view height changes
    setTimeout(adjustFloatingButtonPosition, 60);
}

function toggleView() {
    switchView(currentView === 'list' ? 'map' : 'list');
}

function initGoogleMap() {
    if (googleMap || typeof google === 'undefined' || !google.maps) return;
    const mapElement = document.getElementById('sirirajMap');
    if (!mapElement) return;

    // Center on Siriraj Hospital
    googleMap = new google.maps.Map(mapElement, {
        center: { lat: 13.7578, lng: 100.4850 },
        zoom: 17,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: true,
        zoomControlOptions: {
            position: google.maps.ControlPosition.LEFT_TOP
        },
        styles: [
            {
                featureType: "poi.business",
                stylers: [{ visibility: "off" }]
            },
            {
                featureType: "transit",
                stylers: [{ visibility: "simplified" }]
            }
        ]
    });

    // Close any opened InfoWindow when clicking outside on the map
    googleMap.addListener('click', () => {
        if (activeInfoWindow) {
            activeInfoWindow.close();
            activeInfoWindow = null;
        }
    });

    renderGoogleMapPins();
    if (userLocation.hasRealGPS) {
        updateUserGoogleMapPosition();
    }
}

// Make initGoogleMap available globally for the Google Maps script callback
window.initGoogleMap = initGoogleMap;

function renderGoogleMapPins(filterList = null) {
    if (!googleMap) return;

    // Clear existing markers
    gMarkers.forEach(m => m.setMap(null));
    gMarkers = [];

    const targetList = filterList || locationsData;
    const overallNearestId = [...locationsData].sort((a, b) => a.distanceMeters - b.distanceMeters)[0]?.id;

    targetList.forEach(loc => {
        if (loc.lat == null || loc.lng == null) return;

        const isNearest = (loc.id === overallNearestId);
        const iconSvg = isNearest ? NEAREST_PIN_SVG : STANDARD_PIN_SVG;
        const iconSize = isNearest ? new google.maps.Size(48, 58) : new google.maps.Size(40, 50);
        const anchorPt = isNearest ? new google.maps.Point(24, 55) : new google.maps.Point(20, 48);

        const marker = new google.maps.Marker({
            position: { lat: loc.lat, lng: loc.lng },
            map: googleMap,
            title: loc.name,
            zIndex: isNearest ? 100 : 10,
            icon: {
                url: `data:image/svg+xml;charset=UTF-8,${iconSvg}`,
                size: iconSize,
                scaledSize: iconSize,
                anchor: anchorPt
            }
        });

        const mapsUrl = getGoogleMapsUrl(loc.lat, loc.lng, loc.name);
        const popupImg = loc.image1 || 'assets/images/noimage.jpg';
        const distText = (loc.distanceMeters !== undefined) 
            ? `${loc.distanceMeters.toLocaleString('th-TH')} เมตร (${loc.distanceMeters < 1000 ? 'ระยะเดินถึง' : (loc.distanceMeters/1000).toFixed(1) + ' กม.'})`
            : 'กำลังคำนวณ...';

        const infoContent = `
            <div class="map-popup-card">
                <div class="map-popup-img">
                    <img src="${popupImg}" alt="${loc.name}" onerror="this.src='assets/images/noimage.jpg'">
                </div>
                <div class="map-popup-title">${loc.name}</div>
                <div class="map-popup-dist"><span>👣 ${distText}</span></div>
                <div class="map-popup-gate"><strong>จุดสแกน:</strong> ${loc.gateInfo || '-'}</div>
                <a 
                    href="${mapsUrl}" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    onclick="trackMapsClick('${loc.name}', false)" 
                    class="map-popup-btn"
                >
                    🧭 นำทาง Google Maps
                </a>
            </div>
        `;

        const infoWindow = new google.maps.InfoWindow({
            content: infoContent,
            maxWidth: 240
        });

        marker.addListener('click', () => {
            if (activeInfoWindow) activeInfoWindow.close();
            infoWindow.open(googleMap, marker);
            activeInfoWindow = infoWindow;
        });

        gMarkers.push(marker);
    });
}

function updateUserGoogleMapPosition() {
    if (!googleMap || !userLocation.hasRealGPS) return;

    const userPos = { lat: userLocation.lat, lng: userLocation.lng };

    if (userGMarker) {
        userGMarker.setPosition(userPos);
    } else {
        userGMarker = new google.maps.Marker({
            position: userPos,
            map: googleMap,
            title: "คุณอยู่ที่นี่ (ตำแหน่งสด)",
            zIndex: 9999,
            icon: {
                url: `data:image/svg+xml;charset=UTF-8,${USER_PIN_SVG}`,
                size: new google.maps.Size(36, 36),
                scaledSize: new google.maps.Size(36, 36),
                anchor: new google.maps.Point(18, 18)
            }
        });

        const userWindow = new google.maps.InfoWindow({
            content: `
                <div style="font-family: 'Kanit', sans-serif; font-size: 13px; font-weight: 600; color: #0369a1; padding: 4px;">
                    📍 คุณอยู่ที่นี่ (ตำแหน่งสด)
                </div>
            `
        });
        userGMarker.addListener('click', () => {
            if (activeInfoWindow) activeInfoWindow.close();
            userWindow.open(googleMap, userGMarker);
            activeInfoWindow = userWindow;
        });
    }

    if (userLocation.accuracy) {
        if (userGCircle) {
            userGCircle.setCenter(userPos);
            userGCircle.setRadius(userLocation.accuracy);
        } else {
            userGCircle = new google.maps.Circle({
                map: googleMap,
                center: userPos,
                radius: userLocation.accuracy,
                strokeColor: '#0284C7',
                strokeOpacity: 0.5,
                strokeWeight: 1.5,
                fillColor: '#38BDF8',
                fillOpacity: 0.15,
                zIndex: 1
            });
        }
    }
}

function recenterMapToUser() {
    if (!googleMap) return;
    if (userLocation.hasRealGPS) {
        googleMap.panTo({ lat: userLocation.lat, lng: userLocation.lng });
        googleMap.setZoom(18);
        showToast("📍 เล็งพิกัดตำแหน่งคุณแล้ว", `พิกัดสด (±${userLocation.accuracy || 0} ม.)`);
    } else {
        startLiveTracking();
        showToast("📡 กำลังค้นหาตำแหน่ง...", "กรุณารอรับสัญญาณ GPS สักครู่");
    }
}

function fitAllBuildingPins() {
    if (!googleMap || gMarkers.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    let hasPoint = false;
    gMarkers.forEach(m => {
        if (m.getMap()) {
            bounds.extend(m.getPosition());
            hasPoint = true;
        }
    });
    if (userLocation.hasRealGPS) {
        bounds.extend(new google.maps.LatLng(userLocation.lat, userLocation.lng));
        hasPoint = true;
    }
    if (hasPoint) {
        googleMap.fitBounds(bounds);
    }
}

// ==========================================
// 8. DYNAMIC FLOATING BUTTON DOCKING (AVOID FOOTER)
// ==========================================
let isAdjustingFloatingBtn = false;
function adjustFloatingButtonPosition() {
    const toggleWrapper = document.getElementById('floatingToggleWrapper');
    const footer = document.querySelector('footer');
    if (!toggleWrapper || !footer) return;

    const footerRect = footer.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const defaultBottom = 24; // 24px default margin from bottom

    // When the footer top enters into the viewport
    if (footerRect.top < windowHeight) {
        const overlap = windowHeight - footerRect.top;
        toggleWrapper.style.bottom = `${defaultBottom + overlap}px`;
    } else {
        toggleWrapper.style.bottom = `${defaultBottom}px`;
    }
}

function handleFloatingButtonScroll() {
    if (!isAdjustingFloatingBtn) {
        isAdjustingFloatingBtn = true;
        requestAnimationFrame(() => {
            adjustFloatingButtonPosition();
            isAdjustingFloatingBtn = false;
        });
    }
}

window.addEventListener('scroll', handleFloatingButtonScroll, { passive: true });
window.addEventListener('resize', handleFloatingButtonScroll, { passive: true });

// Initialize on Window Load
window.onload = function () {
    startClock();
    recalculateAndRender();
    startLiveTracking();     // Continuous real-time GPS tracking
    startSlideshowTimer();   // Continuous automatic slideshow between image1 & image2
    adjustFloatingButtonPosition();
};
