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
    hasRealGPS: false
};
let watchId = null;
let lastKnownHeroId = null;
let globalSlideIndex = 0; // 0 = image1 (อาคาร), 1 = image2 (จุดแตะบัตร)
let slideshowTimer = null;

// Map & View State (Leaflet)
let currentView = 'list'; // 'list' | 'map'
let leafletMap = null;
let leafletMarkers = [];
let userLeafletMarker = null;
let userLeafletCircle = null;
let activePopupLocId = null;
let lastFocusedBuildingId = null;
let lastFocusedSource = null; // 'hero' | 'grid'
let lastListScrollY = null;
let sharedBuildingId = null; // ID อาคารที่เปิดมาจากลิงก์แชร์ (?bldg=X หรือ ?id=X)

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
    if (meters == null || isNaN(meters)) return "กำลังคำนวณ...";
    if (meters <= 15) {
        return `อยู่ที่นี่แล้ว (~${meters} ม.)`;
    } else if (meters < 1000) {
        return `ห่าง ${meters.toLocaleString('th-TH')} เมตร`;
    } else {
        const km = (meters / 1000).toFixed(1);
        return `ห่าง ${km} กม. (${meters.toLocaleString('th-TH')} ม.)`;
    }
}

function getWalkingTimeText(meters) {
    if (meters == null || isNaN(meters)) return "🚶 กำลังคำนวณ...";
    if (meters <= 25) return "🎯 ถึงแล้ว!";
    if (meters <= 80) return "🏃 เดิน < 1 นาที";
    const mins = Math.ceil(meters / 80);
    if (mins <= 15) return `🚶 เดิน ~${mins} นาที`;
    
    // คำนวณเวลาเดินทางด้วยรถยนต์ตามสภาพจราจรจริงแบบ 3 ระดับ (Tiered Urban Traffic Model):
    // 1. โซนคอขวดศิริราช (<= 2,500 ม.): ถนนแคบ รถติดสะสมหน้า รพ. ไฟแดงพรานนก/อรุณอมรินทร์
    // 2. โซนเมืองชั้นกลาง (2,500 - 12,000 ม. เช่น บางแค, เจริญนคร, ราชพฤกษ์): ถนนใหญ่ผสมแยกไฟแดง
    // 3. โซนไฮเวย์/นอกเมือง (> 12,000 ม. เช่น สาย 3, สมุทรสาคร): ถนนหลัก/ทางคู่ขนานลอยฟ้าบรมฯ
    let driveMins;
    if (meters <= 2500) {
        driveMins = Math.ceil((meters * 1.35) / 220);
    } else if (meters <= 12000) {
        const innerMins = (2500 * 1.35) / 220; // ~15.3 นาที
        const midMins = ((meters - 2500) * 1.30) / 450;
        driveMins = Math.ceil(innerMins + midMins);
    } else {
        const innerMins = (2500 * 1.35) / 220; // ~15.3 นาที
        const midMins = (9500 * 1.30) / 450;   // ~27.4 นาที
        const outerMins = ((meters - 12000) * 1.20) / 900;
        driveMins = Math.ceil(innerMins + midMins + outerMins);
    }
    driveMins = Math.max(3, driveMins);

    if (driveMins < 60) {
        return `🚗 เดินทาง ~${driveMins} นาที`;
    } else {
        const hours = Math.floor(driveMins / 60);
        const remainMins = driveMins % 60;
        return remainMins > 0 
            ? `🚗 เดินทาง ~${hours} ชม. ${remainMins} นาที` 
            : `🚗 เดินทาง ~${hours} ชม.`;
    }
}

function getDistanceStatusBadge(meters) {
    if (meters == null || isNaN(meters)) {
        return { text: '', colorClass: 'text-slate-500', icon: 'ph-footprints' };
    }
    if (meters <= 450) {
        return { text: 'ระยะเดินถึง', colorClass: 'text-emerald-700', icon: 'ph-footprints' };
    }
    if (meters <= 800) {
        return { text: 'เดินปานกลาง', colorClass: 'text-amber-700', icon: 'ph-footprints' };
    }
    if (meters <= 1500) {
        return { text: 'เดินไกล / นั่งรถ', colorClass: 'text-orange-700', icon: 'ph-footprints' };
    }
    return { text: 'เดินทางด้วยรถ', colorClass: 'text-slate-500', icon: 'ph-car' };
}

function getGoogleMapsUrl(destLat, destLng, distanceMeters = null) {
    const travelMode = (distanceMeters != null && distanceMeters > 1500) ? 'driving' : 'walking';
    return `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${destLat},${destLng}&travelmode=${travelMode}`;
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
// 3. CONTINUOUS REAL-TIME GPS TRACKING & FILTERING
// ==========================================
let lastGpsTimestamp = 0;
let consecutiveRejectedCount = 0;
const MAX_CONSECUTIVE_REJECTIONS = 4; // Fail-safe: หากปฏิเสธติดกัน 4 ครั้ง จะยอมรับพิกัดใหม่เพื่อป้องกันตำแหน่งค้าง

/**
 * กรองสัญญาณกระโดด (GPS Drift & Spike Filter) และเกลี่ยพิกัดให้นุ่มนวลเมื่ออยู่ในอาคาร
 */
function filterIncomingPosition(rawLat, rawLng, rawAccuracy, timestamp = Date.now()) {
    // 1. Initial Fix (ครั้งแรกที่เพิ่งรับสัญญาณ)
    if (!userLocation.hasRealGPS) {
        // หากสัญญาณครั้งแรกแย่เกินไป (> 250 ม. เช่น เสาสัญญาณมือถือทางไกล) ให้รอสัญญาณที่ดีกว่า
        if (rawAccuracy > 250) {
            console.warn(`[GPS Filter] Initial fix ignored due to high uncertainty: ${rawAccuracy}m`);
            return { lat: rawLat, lng: rawLng, accuracy: rawAccuracy, accepted: false };
        }
        consecutiveRejectedCount = 0;
        lastGpsTimestamp = timestamp;
        return { lat: rawLat, lng: rawLng, accuracy: rawAccuracy, accepted: true };
    }

    const prevLat = userLocation.lat;
    const prevLng = userLocation.lng;
    const prevAccuracy = userLocation.accuracy || 20;

    // คำนวณระยะขจัดและความเร็วเสมือนจากการอัปเดตล่าสุด
    const deltaDist = calculateDistanceInMeters(prevLat, prevLng, rawLat, rawLng);
    const deltaTime = Math.max(0.5, (timestamp - lastGpsTimestamp) / 1000); // วินาที
    const apparentSpeed = deltaDist / deltaTime; // เมตร/วินาที

    // 2. ตรวจจับการกระโดดผิดปกติ (Indoor Glitch / Wi-Fi Hop)
    // ความเร็วคนเดินปกติ ~1.2 ม./วิ, วิ่งในตึก ~3-4 ม./วิ
    // หากกระโดด > 25 เมตร ด้วยความเร็วเกิน 7 ม./วิ (> 25 กม./ชม.) ขณะที่ accuracy ไม่นิ่ง (> 30 ม.)
    const isSpeedAnomaly = (deltaDist > 25 && apparentSpeed > 7 && rawAccuracy > 30);
    // หาก accuracy เสื่อมลงอย่างรุนแรง (> 120 ม.) จากเดิมที่เคยจับได้แม่นยำ
    const isSevereAccuracyDegrade = (rawAccuracy > 120 && prevAccuracy <= 50);

    if ((isSpeedAnomaly || isSevereAccuracyDegrade) && consecutiveRejectedCount < MAX_CONSECUTIVE_REJECTIONS) {
        consecutiveRejectedCount++;
        console.warn(`[GPS Filter] Drift spike ignored: dist=${deltaDist}m, speed=${apparentSpeed.toFixed(1)}m/s, acc=${rawAccuracy}m (rejected ${consecutiveRejectedCount}/${MAX_CONSECUTIVE_REJECTIONS})`);
        return { lat: prevLat, lng: prevLng, accuracy: prevAccuracy, accepted: false };
    }

    // ผ่านการตรวจสอบ: รีเซ็ตตัวนับการปฏิเสธ
    consecutiveRejectedCount = 0;
    lastGpsTimestamp = timestamp;

    // 3. Dynamic Smoothing (EMA / Low-pass Filter)
    // นอกอาคารฟ้าเปิด (acc <= 15 ม.): เกาะพิกัดจริงรวดเร็ว (alpha 0.8)
    // ในอาคารที่มี Wi-Fi (acc <= 40 ม.): เกลี่ยอย่างสมดุล (alpha 0.5)
    // ในอาคารอับสัญญาณ (acc > 40 ม.): เกลี่ยแน่นหนาเพื่อลดการสั่น (alpha 0.25)
    let alpha = 0.5;
    if (rawAccuracy <= 15) {
        alpha = 0.8;
    } else if (rawAccuracy <= 40) {
        alpha = 0.5;
    } else {
        alpha = 0.25;
    }

    // Micro-jitter Deadzone:
    // หากขยับตัวไม่ถึง 3.5 เมตร และความเร็วต่ำมาก ให้คงที่หรือเกลี่ยเบามาก (alpha 0.1) เพื่อขจัดอาการหมุดสั่นขณะยืนเฉยๆ ในห้อง
    if (deltaDist < 3.5 && apparentSpeed < 0.8) {
        alpha = 0.1;
    }

    const smoothLat = prevLat * (1 - alpha) + rawLat * alpha;
    const smoothLng = prevLng * (1 - alpha) + rawLng * alpha;

    return {
        lat: smoothLat,
        lng: smoothLng,
        accuracy: rawAccuracy,
        accepted: true
    };
}

function startLiveTracking() {
    if (!navigator.geolocation) {
        showGPSAlertBanner('เบราว์เซอร์ไม่รองรับ GPS', 'อุปกรณ์นี้ไม่รองรับระบบตรวจจับตำแหน่ง');
        showToast('⚠️ ไม่รองรับ GPS', 'อุปกรณ์นี้ไม่รองรับระบบตรวจจับตำแหน่ง');
        return;
    }

    const geoOptions = {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 15000
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
    const rawLat = position.coords.latitude;
    const rawLng = position.coords.longitude;
    const rawAccuracy = Math.round(position.coords.accuracy || 0);
    const timestamp = position.timestamp || Date.now();

    // กรองและเกลี่ยพิกัดเพื่อป้องกันอาการกระโดดในอาคาร
    const filtered = filterIncomingPosition(rawLat, rawLng, rawAccuracy, timestamp);
    if (!filtered.accepted) {
        return;
    }

    const isFirstFix = !userLocation.hasRealGPS;

    userLocation.lat = filtered.lat;
    userLocation.lng = filtered.lng;
    userLocation.accuracy = filtered.accuracy;
    userLocation.hasRealGPS = true;

    hideGPSAlertBanner();

    if (isFirstFix) {
        showToast("🛰️ จับสัญญาณ GPS สำเร็จ!", "ระบบกำลังคำนวณและเรียงจุดแตะบัตรตามระยะจริง");
        if (typeof gtag === 'function') {
            gtag('event', 'gps_connected', { accuracy_meters: filtered.accuracy });
        }
        if (currentView === 'map' && leafletMap && !activePopupLocId) {
            focusMapOnProximity();
        }
    }

    // Recalculate distances and re-order in real time!
    recalculateAndRender();

    // Update user marker on interactive map
    if (leafletMap) updateUserLeafletPosition();
}

function onPositionError(error) {
    console.warn('Geolocation watch error:', error);
    if (!userLocation.hasRealGPS && error.code === error.PERMISSION_DENIED) {
        showGPSAlertBanner(
            'กรุณาเปิดสิทธิ์เข้าถึงตำแหน่ง (GPS)',
            'เพื่อให้ระบบคำนวณและเรียงลำดับจุดแตะบัตรที่ใกล้ที่สุดแบบเรียลไทม์ขณะที่คุณเดิน'
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
                class="w-full h-full object-cover"
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
        // Battery & CPU optimization: only animate if tab is visible and currently on List view
        if (document.hidden || currentView !== 'list') return;

        globalSlideIndex = (globalSlideIndex === 0) ? 1 : 0;
        document.querySelectorAll('.slideshow-box').forEach(box => {
            const key = box.getAttribute('data-slide-id');
            if (key) updateSlideElement(key, globalSlideIndex);
        });
    }, 3500); // changes every 3.5 seconds
}

function stopSlideshowTimer() {
    if (slideshowTimer) {
        clearInterval(slideshowTimer);
        slideshowTimer = null;
    }
}

// Automatically pause slideshow when tab is hidden to save mobile battery
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopSlideshowTimer();
    } else if (currentView === 'list') {
        startSlideshowTimer();
    }
});

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
    const nearestSpot = getNearestLocation();

    // 3. Render Hero card (closest building)
    renderNearestHero(nearestSpot);

    // 4. Filter & re-sort grid cards (ข้ามการลบสร้างหมุด Leaflet ใหม่ เพื่อป้องกันป๊อปอัปหลุดหายขณะรับพิกัด GPS)
    handleSearchAndFilter(false);

    // 5. Update map pins, nearest badges and popup distances in real-time
    if (leafletMap) {
        updateLeafletPinsRealtime();
    }
}

function renderNearestHero(spot) {
    if (!spot) return;

    const walkingEl = document.getElementById('walkingEstimate');
    if (walkingEl) walkingEl.textContent = getWalkingTimeText(spot.distanceMeters);

    const mapsUrl = getGoogleMapsUrl(spot.lat, spot.lng, spot.distanceMeters);
    const container = document.getElementById('nearestCardContainer');

    // If the same building is still nearest, update distance elements directly to prevent image re-render
    if (lastKnownHeroId === spot.id && container.children.length > 0) {
        const distEl = document.getElementById('heroDistanceText');
        const mapsLinkEl = document.getElementById('heroMapsLink');
        const heroMapBtnEl = document.getElementById('heroMapBtn');
        if (distEl) distEl.textContent = formatDistanceBadge(spot.distanceMeters);
        if (mapsLinkEl) mapsLinkEl.href = mapsUrl;
        if (heroMapBtnEl) {
            heroMapBtnEl.setAttribute('onclick', `focusBuildingOnMap(${spot.id}, 'hero')`);
            heroMapBtnEl.setAttribute('aria-label', `ดู ${spot.name} บนแผนที่`);
        }
        return;
    }

    lastKnownHeroId = spot.id;

    container.innerHTML = `
        <div class="card-neo bg-gradient-to-br from-pop-yellow via-[#FFE082] to-pop-mint/40 rounded-3xl p-4 sm:p-6 relative overflow-hidden transition-all duration-300 cursor-pointer" onclick="copyBuildingLink(${spot.id}, event)" title="คลิกเพื่อคัดลอกลิงก์จุดแตะบัตร">
            <!-- Decorative background sticker -->
            <div class="hidden sm:flex absolute -right-6 -bottom-6 w-36 h-36 rounded-full bg-white/30 border-2 border-pop-dark/10 items-center justify-center pointer-events-none"></div>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center relative z-10">
                <!-- Image Column with Slideshow -->
                <div class="lg:col-span-5 relative group">
                    <div class="h-56 sm:h-72 md:h-[400px] lg:h-80 w-full rounded-2xl overflow-hidden border-[3px] border-pop-dark shadow-neo bg-slate-200 relative">
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

                    <!-- Action Buttons: Google Maps (Left) + View on Map (Right) -->
                    <div class="pt-1 flex flex-row items-center gap-2 sm:gap-3">
                        <a 
                            id="heroMapsLink"
                            href="${mapsUrl}" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            onclick="trackMapsClick('${spot.name}', true)"
                            class="btn-neo btn-blue flex-grow font-display font-semibold py-3 sm:py-3.5 px-3 sm:px-5 rounded-2xl text-xs sm:text-base flex items-center justify-center gap-1.5 sm:gap-2 shadow-neo"
                        >
                            <i class="ph-bold ph-navigation-arrow text-base sm:text-xl"></i>
                            <span>นำทางด้วย Google Maps</span>
                        </a>
                        <button
                            type="button"
                            id="heroMapBtn"
                            onclick="focusBuildingOnMap(${spot.id}, 'hero')"
                            aria-label="ดู ${spot.name} บนแผนที่"
                            class="btn-neo btn-white font-display font-semibold py-3 sm:py-3.5 px-3.5 sm:px-5 rounded-2xl text-xs sm:text-base flex items-center justify-center gap-1.5 sm:gap-2 shadow-neo cursor-pointer shrink-0 text-pop-dark hover:text-pop-pink"
                        >
                            <i class="ph-bold ph-map-trifold text-base sm:text-xl text-pop-pink"></i>
                            <span>ดูบนแผนที่</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function handleSearchAndFilter(updateMapPins = true) {
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
        // distance-asc or walkable: เรียงตามระยะทางจริงจากน้อยไปมากเสมอ เพื่อให้ตัวเลขอันดับและระยะทางสอดคล้องกัน 100%
        filtered.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
    }

    renderLocationsGrid(filtered);
    if (leafletMap && updateMapPins) renderLeafletPins(filtered);
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
        countText.textContent = `${list.length} จุด`;
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
    const overallNearestId = getNearestLocation()?.id;

    grid.innerHTML = list.map((loc, index) => {
        const isNearest = loc.id === overallNearestId;
        const statusBadge = getDistanceStatusBadge(loc.distanceMeters);
        const mapsUrl = getGoogleMapsUrl(loc.lat, loc.lng, loc.distanceMeters);
        const distFormatted = (loc.distanceMeters != null && !isNaN(loc.distanceMeters))
            ? (loc.distanceMeters < 1000 
                ? `${loc.distanceMeters.toLocaleString('th-TH')} เมตร` 
                : `${(loc.distanceMeters / 1000).toFixed(1)} กม.`)
            : 'กำลังคำนวณ...';

        return `
            <article class="card-neo bg-white rounded-3xl overflow-hidden flex flex-col justify-between relative transition-all duration-300 cursor-pointer" data-id="${loc.id}" onclick="copyBuildingLink(${loc.id}, event)" title="คลิกเพื่อคัดลอกลิงก์จุดแตะบัตร">
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
                                <i class="ph-fill ${statusBadge.icon} text-pop-pink text-base"></i>
                                <span>${distFormatted}</span>
                            </div>
                            <span class="text-[11px] font-semibold ${statusBadge.colorClass} shrink-0">
                                ${statusBadge.text}
                            </span>
                        </div>

                        <!-- Building Name & Scan Location (Tightly grouped) -->
                        <div class="space-y-0.5">
                            <h3 class="font-display text-lg font-semibold text-pop-dark leading-snug" title="${loc.name}">
                                ${loc.name}
                            </h3>

                            <p class="text-slate-700 flex items-center gap-1.5 text-sm">
                                <i class="ph-bold ph-map-pin text-pop-purple text-base shrink-0"></i>
                                <span>${loc.gateInfo}</span>
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Card Footer Actions: Google Maps (Left) + View on Map (Right, Icon Only) -->
                <div class="px-4 pb-4 sm:px-5 sm:pb-5 pt-1 flex items-center gap-2">
                    <a 
                        href="${mapsUrl}" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        onclick="trackMapsClick('${loc.name}', false)"
                        class="btn-neo btn-yellow flex-grow font-semibold py-2.5 px-3 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-neo-sm"
                    >
                        <i class="ph-bold ph-navigation-arrow text-base"></i>
                        <span>นำทางด้วย Google Maps</span>
                    </a>
                    <button 
                        type="button"
                        onclick="focusBuildingOnMap(${loc.id}, 'grid')"
                        aria-label="ดู ${loc.name} บนแผนที่"
                        class="btn-neo btn-white w-10 h-10 shrink-0 rounded-xl flex items-center justify-center shadow-neo-sm text-pop-dark hover:text-pop-pink cursor-pointer"
                    >
                        <i class="ph-bold ph-map-trifold text-lg"></i>
                    </button>
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
    sharedBuildingId = null;
    if (window.history && window.history.replaceState) {
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState(null, '', cleanUrl);
    }
    handleSearchAndFilter();
}

function resetAllFilters() {
    const input = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    if (input) input.value = '';
    if (sortSelect) sortSelect.value = 'distance-asc';
    sharedBuildingId = null;
    if (window.history && window.history.replaceState) {
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState(null, '', cleanUrl);
    }
    handleSearchAndFilter();
}

/**
 * Reset to initial Home state: clears search, reset sort, switch to list view, and smooth scroll to top
 */
function resetToHome() {
    // 1. Dismiss mobile virtual keyboard if open
    if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
    }

    // 2. Reset all search input, filters, sort order and URL state
    resetAllFilters();

    // 3. If currently on Map view, switch back to List view
    if (typeof currentView !== 'undefined' && currentView !== 'list' && typeof switchView === 'function') {
        switchView('list');
    }

    // 4. Smoothly scroll back to the top of the page
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// ==========================================
// 6.1 SHARE & DEEP LINK HELPERS
// ==========================================
function getBuildingShareUrl(buildingId) {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('bldg', buildingId);
    return url.toString();
}

async function copyBuildingLink(buildingId, event = null) {
    // ป้องกันการคัดลอกลิงก์ซ้ำซ้อน หากผู้ใช้ตั้งใจคลิกปุ่มนำทาง Google Maps หรือปุ่มดูแผนที่
    if (event && event.target && event.target.closest('a, button, input, select, label')) {
        return;
    }

    const loc = locationsData.find(l => l.id === Number(buildingId));
    if (!loc) return;

    const shareUrl = getBuildingShareUrl(loc.id);
    let copied = false;

    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(shareUrl);
            copied = true;
        } catch (err) {
            console.warn('Clipboard API writeText failed, trying fallback:', err);
        }
    }

    if (!copied) {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = shareUrl;
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            textArea.style.top = "-9999px";
            textArea.setAttribute("readonly", "");
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            copied = document.execCommand('copy');
            document.body.removeChild(textArea);
        } catch (err2) {
            console.warn('Fallback execCommand copy failed:', err2);
        }
    }

    if (copied) {
        showToast("คัดลอกลิงก์แล้ว!", `${loc.name}`, "🔗");
        if (typeof gtag === 'function') {
            gtag('event', 'share_building_link', {
                building_id: loc.id,
                building_name: loc.name
            });
        }
    } else {
        showToast("⚠️ ไม่สามารถคัดลอกอัตโนมัติ", "กรุณาลองใหม่อีกครั้ง");
    }
}

function handleSharedBuildingParam() {
    const params = new URLSearchParams(window.location.search);
    const bldgId = params.get('bldg') || params.get('id');
    if (!bldgId) return;

    const loc = locationsData.find(l => l.id === Number(bldgId));
    if (!loc) return;

    // บันทึก ID อาคารที่เปิดมาจากลิงก์แชร์ เพื่อนำไปเปิด Popup บนแผนที่เมื่อผู้ใช้สลับไปดูแผนที่
    sharedBuildingId = loc.id;

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    const sortSelect = document.getElementById('sortSelect');

    if (searchInput) {
        searchInput.value = loc.name;
    }
    if (clearBtn) {
        clearBtn.classList.remove('hidden');
    }
    if (sortSelect) {
        sortSelect.value = 'distance-asc';
    }

    // กรองการแสดงผลให้เหลือเฉพาะตึกที่ได้รับลิงก์แชร์มา
    handleSearchAndFilter(true);

    // เลื่อนหน้าจอลงมาโฟกัสที่การ์ดตึกที่แชร์มาทันที (หลบการ์ดตึกใกล้สุดด้านบน)
    setTimeout(() => {
        const headerEl = document.getElementById('locationsHeaderBar');
        const cardEl = document.querySelector(`article[data-id="${loc.id}"]`);
        const targetEl = headerEl || cardEl;
        if (targetEl) {
            let actualTop = 0;
            let curr = targetEl;
            while (curr) {
                actualTop += curr.offsetTop || 0;
                curr = curr.offsetParent;
            }
            const navHeader = document.querySelector('header');
            const navHeight = navHeader ? navHeader.offsetHeight : 80;
            const targetY = Math.max(0, actualTop - navHeight - 14);
            window.scrollTo({
                top: targetY,
                behavior: 'smooth'
            });
        }
    }, 150);
}

let toastTimeout;
function showToast(title, message, emoji = '📡') {
    const toast = document.getElementById('toastBox');
    if (!toast) return;

    const emojiEl = document.getElementById('toastEmoji');
    if (emojiEl) emojiEl.textContent = emoji;

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
let clockInterval = null;
function startClock() {
    const clockEl = document.getElementById('liveClock');
    if (!clockEl) return;
    const update = () => {
        const now = new Date();
        clockEl.textContent = "🕒 " + now.toLocaleTimeString('th-TH', { hour12: false });
    };
    update();
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(update, 1000);
}

// Start clock immediately so users never see placeholder time
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startClock);
} else {
    startClock();
}

// ==========================================
// 7. INTERACTIVE MAP CONTROLLER (LEAFLET + HUMANITARIAN HOT)
// ==========================================

const SIRIRAJ_MAIN_LAT = 13.7578;
const SIRIRAJ_MAIN_LNG = 100.4850;

// Smart Proximity Helpers
function isInsideSirirajHospital(loc) {
    if (!loc) return false;
    if (loc.isMainHospital !== undefined) return Boolean(loc.isMainHospital);
    if (loc.campus) return loc.campus === 'main' || loc.campus === 'siriraj';
    return Number(loc.id) <= 24;
}

function getNearestLocation() {
    if (!locationsData || locationsData.length === 0) return null;
    const sorted = [...locationsData].sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
    return sorted[0] || null;
}

function getLocalClusterLocations() {
    const nearest = getNearestLocation();

    // If user has real GPS and is close to an external/satellite site (ID 25 กายอุปกรณ์, ID 26 ปฐมภูมิ, ID 27 สาย 3, ID 28 ICS, ID 29 สมุทรสาคร)
    if (userLocation.hasRealGPS && nearest && nearest.distanceMeters <= 3000 && !isInsideSirirajHospital(nearest)) {
        return [nearest];
    }

    // Default & Main Cluster: เฉพาะจุดแตะบัตรภายในโรงพยาบาลศิริราช (IDs 1-24)
    const sirirajHospitalList = locationsData.filter(loc => isInsideSirirajHospital(loc));
    return sirirajHospitalList.length > 0 ? sirirajHospitalList : locationsData;
}

function focusMapOnProximity() {
    if (!leafletMap) return;

    // หากมีการค้นหา/กรองเหลือจุดเดียว ให้โฟกัสไปที่จุดนั้น
    const query = (document.getElementById('searchInput')?.value || '').trim();
    if (query && leafletMarkers.length === 1 && leafletMarkers[0]._locationData) {
        const loc = leafletMarkers[0]._locationData;
        leafletMap.setView([loc.lat, loc.lng], 17, { animate: true });
        return;
    }

    const nearest = getNearestLocation();
    if (nearest && nearest.lat != null && nearest.lng != null) {
        // โฟกัสไปที่สถานที่/จุดแตะบัตรที่ใกล้ที่สุดบนแผนที่เสมอ (ไม่โฟกัสตำแหน่งผู้ใช้ เพื่อให้เห็นจุดแตะบัตรชัดเจน)
        leafletMap.setView([nearest.lat, nearest.lng], 17, { animate: true });
    } else {
        // Fallback กรณีไม่มีข้อมูลจุดแตะบัตร ให้เล็งไปที่ รพ.ศิริราช
        leafletMap.setView([SIRIRAJ_MAIN_LAT, SIRIRAJ_MAIN_LNG], 17, { animate: true });
    }
}

function switchView(viewMode, skipProximity = false) {
    if (currentView === viewMode) return;
    const wasMapView = (currentView === 'map');
    const wasListView = (currentView === 'list');
    currentView = viewMode;
    const listGrid = document.getElementById('locationsGrid');
    const emptyState = document.getElementById('emptyState');
    const mapContainer = document.getElementById('mapViewContainer');

    const listBtn = document.getElementById('viewListBtn');
    const mapBtn = document.getElementById('viewMapBtn');
    const floatIcon = document.getElementById('floatingToggleIcon');
    const floatText = document.getElementById('floatingToggleText');

    if (viewMode === 'map') {
        if (wasListView && lastListScrollY === null) {
            lastListScrollY = window.pageYOffset || document.documentElement.scrollTop;
        }

        // ป้องกัน Browser ทำ Scroll Clamping หลุดไปชน Footer เมื่อความสูงหน้าเว็บหดลง
        // หากตำแหน่ง Scroll ปัจจุบันอยู่ลึกกว่าหัวข้อ (เช่น เพิ่งสลับกลับไปดูการ์ดด้านล่าง)
        // ให้ดึงตำแหน่งกลับมาที่ระดับหัวข้อทันทีก่อนสั่งซ่อน Grid
        const headerEl = document.getElementById('locationsHeaderBar');
        if (headerEl) {
            let actualTop = 0;
            let curr = headerEl;
            while (curr) {
                actualTop += curr.offsetTop || 0;
                curr = curr.offsetParent;
            }
            const navHeader = document.querySelector('header');
            const navHeight = navHeader ? navHeader.offsetHeight : 80;
            const targetY = Math.max(0, actualTop - navHeight - 14);

            const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
            if (currentScroll > targetY) {
                window.scrollTo(0, targetY);
            }
        }

        stopSlideshowTimer(); // Pause image slideshow to save CPU/battery while viewing map
        if (listGrid) listGrid.classList.add('hidden');
        if (emptyState) emptyState.classList.add('hidden');
        if (mapContainer) mapContainer.classList.remove('hidden');

        // Update Top Switcher Buttons (Neo-pop themed)
        if (listBtn) listBtn.className = "tab-btn-inactive";
        if (mapBtn) mapBtn.className = "tab-btn-active";

        // Update Floating Button Text & Icon
        if (floatIcon) floatIcon.className = "ph-bold ph-list-dashes text-lg";
        if (floatText) floatText.textContent = "ดูรายการ";

        // เมื่อสลับมาดูแผนที่จากแท็บหรือปุ่มลอย
        if (!skipProximity) {
            if (sharedBuildingId) {
                // หากเปิดมาจากลิงก์แชร์ตึก ให้คงค่าตึกที่แชร์ไว้ เพื่อเปิด Popup อัตโนมัติ
                lastFocusedBuildingId = sharedBuildingId;
                activePopupLocId = sharedBuildingId;
            } else {
                activePopupLocId = null;
                lastFocusedBuildingId = null;
                lastFocusedSource = null;
                if (leafletMap) {
                    leafletMap.closePopup();
                }
            }
        }

        // Initialize or refresh Leaflet Map with smart proximity focus
        if (!leafletMap) {
            initLeafletMap();
        } else {
            updateLeafletPinsRealtime();
            setTimeout(() => {
                leafletMap.invalidateSize();
                if (!skipProximity) {
                    if (sharedBuildingId) {
                        const targetLoc = locationsData.find(l => l.id === sharedBuildingId);
                        if (targetLoc && targetLoc.lat != null && targetLoc.lng != null) {
                            renderLeafletPins(locationsData); // แสดงทุกตึกเพื่อให้เห็น "ในดงตึกอื่นๆ"
                            const targetLat = targetLoc.lat + 0.00035;
                            leafletMap.setView([targetLat, targetLoc.lng], 18, { animate: true });
                            activePopupLocId = targetLoc.id;
                            setTimeout(() => {
                                const marker = leafletMarkers.find(m => m._locationData && m._locationData.id === targetLoc.id);
                                if (marker) marker.openPopup();
                            }, 250);
                            updateOverviewButtonUI(false);
                            return;
                        }
                    }
                    leafletMap.closePopup();
                    focusMapOnProximity();
                    updateOverviewButtonUI(false);
                }
            }, 100);
        }

        if (typeof gtag === 'function') {
            gtag('event', 'switch_view', { view_mode: 'map' });
        }
    } else {
        // 'list' view
        startSlideshowTimer(); // Resume image slideshow
        if (listGrid) listGrid.classList.remove('hidden');
        if (mapContainer) mapContainer.classList.add('hidden');

        // ปิด Popup บนแผนที่เมื่อสลับกลับมาดูรายการ
        if (leafletMap) {
            leafletMap.closePopup();
        }
        activePopupLocId = null;

        // Update Top Switcher Buttons (Neo-pop themed)
        if (listBtn) listBtn.className = "tab-btn-active";
        if (mapBtn) mapBtn.className = "tab-btn-inactive";

        // Update Floating Button Text & Icon
        if (floatIcon) floatIcon.className = "ph-bold ph-map-trifold text-lg";
        if (floatText) floatText.textContent = "ดูแผนที่";

        if (typeof gtag === 'function') {
            gtag('event', 'switch_view', { view_mode: 'list' });
        }

        if (wasMapView) {
            setTimeout(restoreListPosition, 80);
        }
    }

    // Readjust floating button position when view height changes
    setTimeout(adjustFloatingButtonPosition, 60);
}

function scrollToLocations() {
    const headerEl = document.getElementById('locationsHeaderBar');
    if (!headerEl) return;
    const navHeader = document.querySelector('header');
    const navHeight = navHeader ? navHeader.offsetHeight : 80;

    let actualTop = 0;
    let curr = headerEl;
    while (curr) {
        actualTop += curr.offsetTop || 0;
        curr = curr.offsetParent;
    }
    const targetY = Math.max(0, actualTop - navHeight - 14);

    window.scrollTo({
        top: targetY,
        behavior: 'smooth'
    });
}

function restoreListPosition() {
    // หากกดดูแผนที่มาจากการ์ด "ใกล้ฉันที่สุด" (Hero Card)
    // เมื่อสลับกลับมาที่รายการ ให้เลื่อนขึ้นไปจนสุดจอด้านบน (top: 0) เพื่อให้เห็นหัวข้อ "ใกล้คุณที่สุดตอนนี้" ครบถ้วน
    if (lastFocusedSource === 'hero') {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
        lastFocusedBuildingId = null;
        lastFocusedSource = null;
        lastListScrollY = null;
        return;
    }

    let targetEl = null;

    if (lastFocusedBuildingId) {
        targetEl = document.querySelector(`#locationsGrid [data-id="${lastFocusedBuildingId}"]`);
    } else if (activePopupLocId) {
        targetEl = document.querySelector(`#locationsGrid [data-id="${activePopupLocId}"]`);
    }

    // Fallback if specific source card was not found
    if (!targetEl && (lastFocusedBuildingId || activePopupLocId)) {
        const fallbackId = lastFocusedBuildingId || activePopupLocId;
        targetEl = document.querySelector(`#locationsGrid [data-id="${fallbackId}"]`);
    }

    if (targetEl) {
        const navHeader = document.querySelector('header');
        const navHeight = navHeader ? navHeader.offsetHeight : 80;

        let actualTop = 0;
        let curr = targetEl;
        while (curr) {
            actualTop += curr.offsetTop || 0;
            curr = curr.offsetParent;
        }
        const targetY = Math.max(0, actualTop - navHeight - 16);

        window.scrollTo({
            top: targetY,
            behavior: 'smooth'
        });

        // รีเซ็ตค่าการจำตำแหน่งชั่วคราว
        lastFocusedBuildingId = null;
        lastFocusedSource = null;
        lastListScrollY = null;
        return;
    }

    if (lastListScrollY !== null && lastListScrollY !== undefined) {
        window.scrollTo({
            top: lastListScrollY,
            behavior: 'smooth'
        });
        lastListScrollY = null;
        return;
    }

    // กรณีไม่มีการ์ดที่จำไว้ ให้เลื่อนลงมาที่หัวข้อจุดแตะบัตรตามปกติ
    scrollToLocations();
}

function toggleView() {
    if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
    }
    if (currentView === 'list') {
        switchView('map');
        setTimeout(scrollToLocations, 60);
    } else {
        switchView('list');
    }
}

function focusBuildingOnMap(buildingId, source = null) {
    const targetLoc = locationsData.find(l => l.id === Number(buildingId));
    if (!targetLoc || targetLoc.lat == null || targetLoc.lng == null) return;

    if (typeof gtag === 'function') {
        gtag('event', 'focus_building_map', {
            building_id: targetLoc.id,
            building_name: targetLoc.name
        });
    }

    const wasListView = (currentView !== 'map');
    if (wasListView) {
        lastListScrollY = window.pageYOffset || document.documentElement.scrollTop;
        lastFocusedBuildingId = Number(buildingId);
        lastFocusedSource = source;
        switchView('map', true); // ข้ามการตั้งค่า proximity อัตโนมัติ เพื่อบินตรงไปยังอาคารเป้าหมาย
    } else {
        lastFocusedBuildingId = Number(buildingId);
        if (source) lastFocusedSource = source;
    }

    // เลื่อนมุมมองหน้าจอลงมายังส่วนแผนที่
    setTimeout(scrollToLocations, 60);

    const delay = wasListView ? 200 : 60;
    setTimeout(() => {
        if (!leafletMap) return;
        leafletMap.invalidateSize();

        let popupOpened = false;
        const openTargetPopup = () => {
            if (popupOpened) return;
            popupOpened = true;
            let marker = leafletMarkers.find(m => m._locationData && m._locationData.id === targetLoc.id);
            if (!marker) {
                renderLeafletPins();
                marker = leafletMarkers.find(m => m._locationData && m._locationData.id === targetLoc.id);
            }
            if (marker) {
                marker.openPopup();
            }
        };

        // เมื่อหมุดเคลื่อนที่ถึงตำแหน่ง ให้เปิดการ์ดข้อมูล popup ทันที
        leafletMap.once('moveend', openTargetPopup);
        // เล็งเป้าหมายค่อนไปทางเหนือเล็กน้อย (+0.00035 deg latitude) เพื่อให้ตัวหมุดอยู่ด้านล่างและการ์ดป๊อปอัปแสดงตรงกลางจอพอดี ไม่ล้นขอบจอบนของมือถือ
        const targetLat = targetLoc.lat + 0.00035;
        leafletMap.flyTo([targetLat, targetLoc.lng], 18, { animate: true, duration: 0.8 });
        setTimeout(openTargetPopup, 900); // เผื่อกรณีที่พิกัดใกล้มากจน moveend ไม่ทริกเกอร์
        updateOverviewButtonUI(false);
    }, delay);
}

function initLeafletMap() {
    if (leafletMap || typeof L === 'undefined') return;
    const mapElement = document.getElementById('sirirajMap');
    if (!mapElement) return;

    // Smart Initial Center: หากเปิดมาจากลิงก์แชร์ตึก ให้เริ่มที่ตึกนั้นพร้อมระดับซูมใกล้ 18
    let initialCenter = [SIRIRAJ_MAIN_LAT, SIRIRAJ_MAIN_LNG];
    let initialZoom = 17;
    if (sharedBuildingId) {
        const targetLoc = locationsData.find(l => l.id === sharedBuildingId);
        if (targetLoc && targetLoc.lat != null && targetLoc.lng != null) {
            initialCenter = [targetLoc.lat + 0.00035, targetLoc.lng];
            initialZoom = 18;
        }
    } else {
        const query = (document.getElementById('searchInput')?.value || '').trim();
        if (query) {
            const matched = locationsData.find(l => l.name.toLowerCase().includes(query.toLowerCase()));
            if (matched && matched.lat != null && matched.lng != null) {
                initialCenter = [matched.lat, matched.lng];
            }
        } else {
            const nearest = getNearestLocation();
            if (nearest && nearest.lat != null && nearest.lng != null) {
                initialCenter = [nearest.lat, nearest.lng];
            }
        }
    }

    leafletMap = L.map('sirirajMap', {
        center: initialCenter,
        zoom: initialZoom,
        zoomControl: true,
        attributionControl: true,
        closePopupOnClick: false // ป้องกันการแตะโดนหน้าจอแผนที่แล้วป๊อปอัปหลุดหายบนมือถือ
    });

    // ป้องกันการส่งต่อ Touch/Click จากปุ่มควบคุมลอยและ Legend เข้าสู่ Canvas ของแผนที่
    const quickControls = document.getElementById('mapQuickControls');
    if (quickControls) {
        L.DomEvent.disableClickPropagation(quickControls);
        L.DomEvent.disableScrollPropagation(quickControls);
    }
    const legendBanner = document.querySelector('.map-legend-banner');
    if (legendBanner) {
        L.DomEvent.disableClickPropagation(legendBanner);
        L.DomEvent.disableScrollPropagation(legendBanner);
    }

    // อัปเดตไอคอนและข้อความบนปุ่มภาพรวมให้ตรงกับระดับ Zoom จริงของแผนที่แบบอัตโนมัติ
    leafletMap.on('zoomend', () => {
        updateOverviewButtonUI(leafletMap.getZoom() <= 13);
    });

    // Humanitarian OpenStreetMap Team (HOT) - โทนสีอบอุ่น พาสเทล ไฮไลต์อาคารและโรงพยาบาลชัดเจน
    L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/" target="_blank" rel="noopener noreferrer">HOT</a>'
    }).addTo(leafletMap);

    renderLeafletPins(locationsData);

    if (userLocation.hasRealGPS) {
        updateUserLeafletPosition();
    }

    // หากเปิดมาจากลิงก์แชร์ตึก ให้เปิดป๊อปอัปของตึกนั้นขึ้นมาทันทีท่ามกลางดงตึกอื่นๆ
    if (sharedBuildingId) {
        const targetLoc = locationsData.find(l => l.id === sharedBuildingId);
        if (targetLoc) {
            activePopupLocId = targetLoc.id;
            lastFocusedBuildingId = targetLoc.id;
            setTimeout(() => {
                const marker = leafletMarkers.find(m => m._locationData && m._locationData.id === targetLoc.id);
                if (marker) marker.openPopup();
            }, 300);
        }
    }

    // Leaflet needs invalidateSize once container is visible
    setTimeout(() => {
        if (leafletMap) leafletMap.invalidateSize();
    }, 200);
}

function createPinDivIcon(isNearest) {
    const iconHtml = isNearest ? `
        <div class="pin-svg-wrapper" style="width:48px;height:58px;transform:translate(-50%, -100%);filter:drop-shadow(0 4px 6px rgba(0,0,0,0.25));cursor:pointer;">
            <svg width="48" height="58" viewBox="0 0 48 58">
                <path d="M24 2C12.95 2 4 10.95 4 22c0 14.2 18.2 30.5 19 31.2a1.5 1.5 0 0 0 2 0C25.8 52.5 44 36.2 44 22 44 10.95 35.05 2 24 2z" fill="#FF5D8F" stroke="#1E1B2E" stroke-width="2.5"/>
                <circle cx="24" cy="21" r="13" fill="#FFFFFF" stroke="#1E1B2E" stroke-width="1.5"/>
                <text x="24" y="27" font-size="15" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif">🔥</text>
            </svg>
        </div>
    ` : `
        <div class="pin-svg-wrapper" style="width:40px;height:50px;transform:translate(-50%, -100%);filter:drop-shadow(0 3px 5px rgba(0,0,0,0.2));cursor:pointer;">
            <svg width="40" height="50" viewBox="0 0 40 50">
                <path d="M20 2C10.6 2 3 9.6 3 19c0 12.2 15.5 26.2 16.2 26.8a1.3 1.3 0 0 0 1.6 0C21.5 45.2 37 31.2 37 19 37 9.6 29.4 2 20 2z" fill="#FFB703" stroke="#1E1B2E" stroke-width="2.5"/>
                <circle cx="20" cy="18" r="11" fill="#FFFFFF" stroke="#1E1B2E" stroke-width="1.5"/>
                <text x="20" y="23" font-size="13" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif">📍</text>
            </svg>
        </div>
    `;

    return L.divIcon({
        className: 'custom-leaflet-marker',
        html: iconHtml,
        iconSize: [0, 0],
        popupAnchor: [0, isNearest ? -56 : -48]
    });
}

function renderLeafletPins(filterList = null) {
    if (!leafletMap) return;

    const preservedPopupId = activePopupLocId;

    // Clear existing markers
    leafletMarkers.forEach(m => leafletMap.removeLayer(m));
    leafletMarkers = [];

    const targetList = filterList || locationsData;
    const overallNearestId = getNearestLocation()?.id;

    targetList.forEach(loc => {
        if (loc.lat == null || loc.lng == null) return;

        const isNearest = (loc.id === overallNearestId);
        const marker = L.marker([loc.lat, loc.lng], {
            icon: createPinDivIcon(isNearest),
            title: loc.name,
            zIndexOffset: isNearest ? 1000 : 100
        }).addTo(leafletMap);
        marker._isNearest = isNearest;

        const mapsUrl = getGoogleMapsUrl(loc.lat, loc.lng, loc.distanceMeters);
        const popupImg = loc.image1 || 'assets/images/noimage.jpg';
        const distText = (loc.distanceMeters !== undefined) 
            ? (loc.distanceMeters < 1000 
                ? `${loc.distanceMeters.toLocaleString('th-TH')} เมตร` 
                : `${(loc.distanceMeters / 1000).toFixed(1)} กม.`)
            : 'กำลังคำนวณ...';
        const popupIcon = (loc.distanceMeters != null && loc.distanceMeters > 1500) ? 'ph-car' : 'ph-footprints';

        const infoContent = `
            <div class="map-popup-card">
                <div class="map-popup-img">
                    <img src="${popupImg}" alt="${loc.name}" onerror="this.src='assets/images/noimage.jpg'">
                </div>
                <div class="map-popup-title">${loc.name}</div>
                <div class="map-popup-dist" id="popup-dist-${loc.id}">
                    <i class="ph-fill ${popupIcon} text-base"></i>
                    <span>${distText}</span>
                </div>
                <div class="map-popup-gate"><strong>จุดสแกน:</strong> ${loc.gateInfo || '-'}</div>
                <a 
                    id="popup-maps-${loc.id}"
                    href="${mapsUrl}" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    onclick="trackMapsClick('${loc.name}', false)" 
                    class="btn-neo btn-blue w-full font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-neo-sm !text-white no-underline"
                >
                    <i class="ph-bold ph-navigation-arrow text-base"></i>
                    <span>นำทาง Google Maps</span>
                </a>
            </div>
        `;

        marker.bindPopup(infoContent, {
            maxWidth: 240,
            className: 'neo-leaflet-popup',
            closeOnClick: false,
            autoPanPadding: [20, 50]
        });

        marker.on('popupopen', () => {
            activePopupLocId = loc.id;
        });
        marker.on('popupclose', () => {
            if (activePopupLocId === loc.id) {
                activePopupLocId = null;
            }
        });

        marker._locationData = loc;
        leafletMarkers.push(marker);

        if (preservedPopupId && loc.id === preservedPopupId) {
            setTimeout(() => {
                if (marker && leafletMap && leafletMap.hasLayer(marker)) {
                    marker.openPopup();
                }
            }, 60);
        }
    });

    // If user filtered by search to 1 or 2 specific buildings, smoothly fly to them
    if (filterList && filterList.length > 0 && filterList.length <= 2 && currentView === 'map') {
        if (filterList.length === 1) {
            leafletMap.flyTo([filterList[0].lat, filterList[0].lng], 18, { animate: true });
        } else {
            const bounds = L.featureGroup(leafletMarkers).getBounds();
            leafletMap.flyToBounds(bounds.pad(0.2), { animate: true });
        }
    }
}

/**
 * อัปเดตระยะทาง ลิงก์นำทาง และตราตึกใกล้สุดบนแผนที่แบบเรียลไทม์
 * โดยไม่ต้องลบหมุดเดิมทิ้ง เพื่อป้องกันอาการป๊อปอัปหลุดหรือแผนที่กะพริบ
 */
function updateLeafletPinsRealtime() {
    if (!leafletMap || !leafletMarkers || leafletMarkers.length === 0) return;

    const overallNearestId = getNearestLocation()?.id;

    leafletMarkers.forEach(marker => {
        const loc = marker._locationData;
        if (!loc) return;

        // 1. สลับสไตล์หมุด (Pin DivIcon) เมื่อเปลี่ยนตึกใกล้ที่สุด
        const isNearest = (loc.id === overallNearestId);
        if (marker._isNearest !== isNearest) {
            marker._isNearest = isNearest;
            marker.setIcon(createPinDivIcon(isNearest));
            marker.setZIndexOffset(isNearest ? 1000 : 100);
        }

        // 2. คำนวณระยะทางและไอคอนล่าสุด
        const mapsUrl = getGoogleMapsUrl(loc.lat, loc.lng, loc.distanceMeters);
        const popupImg = loc.image1 || 'assets/images/noimage.jpg';
        const distText = (loc.distanceMeters !== undefined) 
            ? (loc.distanceMeters < 1000 
                ? `${loc.distanceMeters.toLocaleString('th-TH')} เมตร` 
                : `${(loc.distanceMeters / 1000).toFixed(1)} กม.`)
            : 'กำลังคำนวณ...';
        const popupIcon = (loc.distanceMeters != null && loc.distanceMeters > 1500) ? 'ph-car' : 'ph-footprints';

        // 3. หาก Popup เปิดอยู่บนจอ ณ วินาทีนั้น ให้ DOM อัปเดตตัวเลขและลิงก์ทันทีอย่างไร้อาการสะดุด
        const distEl = document.getElementById(`popup-dist-${loc.id}`);
        const mapsEl = document.getElementById(`popup-maps-${loc.id}`);
        if (distEl) {
            const span = distEl.querySelector('span');
            const icon = distEl.querySelector('i');
            if (span && span.textContent !== distText) span.textContent = distText;
            if (icon && !icon.classList.contains(popupIcon)) icon.className = `ph-fill ${popupIcon} text-base`;
        }
        if (mapsEl && mapsEl.href !== mapsUrl) {
            mapsEl.href = mapsUrl;
        }

        // 4. บันทึกข้อมูลป๊อปอัปอัปเดตใส่ตัว Marker เผื่อผู้ใช้กดเปิดในอนาคต
        const infoContent = `
            <div class="map-popup-card">
                <div class="map-popup-img">
                    <img src="${popupImg}" alt="${loc.name}" onerror="this.src='assets/images/noimage.jpg'">
                </div>
                <div class="map-popup-title">${loc.name}</div>
                <div class="map-popup-dist" id="popup-dist-${loc.id}">
                    <i class="ph-fill ${popupIcon} text-base"></i>
                    <span>${distText}</span>
                </div>
                <div class="map-popup-gate"><strong>จุดสแกน:</strong> ${loc.gateInfo || '-'}</div>
                <a 
                    id="popup-maps-${loc.id}"
                    href="${mapsUrl}" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    onclick="trackMapsClick('${loc.name}', false)" 
                    class="btn-neo btn-blue w-full font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-neo-sm !text-white no-underline"
                >
                    <i class="ph-bold ph-navigation-arrow text-base"></i>
                    <span>นำทาง Google Maps</span>
                </a>
            </div>
        `;
        if (marker.getPopup()) {
            marker.setPopupContent(infoContent);
        }
    });
}

function updateUserLeafletPosition() {
    if (!leafletMap || !userLocation.hasRealGPS) return;

    const userLatLng = [userLocation.lat, userLocation.lng];
    const accuracy = userLocation.accuracy;

    const popupContent = `
        <div style="font-family: 'Kanit', sans-serif; font-size: 13px; font-weight: 600; color: #0369a1; padding: 2px;">
            📍 คุณอยู่ที่นี่ ${accuracy ? `<span style="font-size: 11px; font-weight: 400; color: #64748b;">(±${accuracy} ม.)</span>` : ''}
        </div>
    `;

    if (userLeafletMarker) {
        userLeafletMarker.setLatLng(userLatLng);
        userLeafletMarker.setPopupContent(popupContent);
    } else {
        const userIcon = L.divIcon({
            className: 'custom-leaflet-user-marker',
            html: `
                <div class="user-gps-pulse-container">
                    <div class="user-gps-ring"></div>
                    <div class="user-gps-dot"></div>
                </div>
            `,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            popupAnchor: [0, -14]
        });

        userLeafletMarker = L.marker(userLatLng, {
            icon: userIcon,
            title: "คุณอยู่ที่นี่",
            zIndexOffset: 9999
        }).addTo(leafletMap);

        userLeafletMarker.bindPopup(popupContent, { className: 'neo-leaflet-popup' });
    }

    // Map Accuracy Circle Guard:
    // - แสดงวงกลมความแม่นยำเฉพาะเมื่อ accuracy <= 300 เมตร
    // - หาก accuracy > 300 เมตร (เช่น กรณีต่อเน็ตบ้าน, IP Wifi หรือจับสัญญาณในตึกอับสัญญาณ) ให้ซ่อนวงกลมเพื่อไม่ให้บดบังหมุดตึกทั้งหมด
    const MAX_ACCURACY_RADIUS = 300;
    if (accuracy && accuracy <= MAX_ACCURACY_RADIUS) {
        if (userLeafletCircle) {
            userLeafletCircle.setLatLng(userLatLng);
            userLeafletCircle.setRadius(accuracy);
        } else {
            userLeafletCircle = L.circle(userLatLng, {
                radius: accuracy,
                color: '#0284C7',
                weight: 1.5,
                opacity: 0.5,
                fillColor: '#38BDF8',
                fillOpacity: 0.15
            }).addTo(leafletMap);
        }
    } else if (userLeafletCircle) {
        leafletMap.removeLayer(userLeafletCircle);
        userLeafletCircle = null;
    }
}

let isTogglingOverview = false;

function updateOverviewButtonUI(isWideOverview) {
    const icon = document.getElementById('overviewMapIcon');
    const text = document.getElementById('overviewMapText');
    const btn = document.getElementById('overviewMapBtn');
    if (!btn) return;

    if (isWideOverview) {
        if (icon) icon.className = "ph-bold ph-hospital text-base text-pop-pink";
        if (text) text.textContent = "รพ.ศิริราช";
        btn.title = "ดูเฉพาะภายในโรงพยาบาลศิริราช";
    } else {
        if (icon) icon.className = "ph-bold ph-buildings text-base text-pop-blue";
        if (text) text.textContent = "ทั้งหมด";
        btn.title = "ดูจุดแตะบัตรทั้งหมด";
    }
}

function recenterMapToUser() {
    if (!leafletMap) return;
    leafletMap.closePopup();
    activePopupLocId = null;
    updateOverviewButtonUI(false);
    if (userLocation.hasRealGPS) {
        leafletMap.setView([userLocation.lat, userLocation.lng], 18, { animate: true });
        showToast("📍 เล็งพิกัดตำแหน่งคุณแล้ว", `พิกัด (±${userLocation.accuracy || 0} ม.)`);
    } else {
        startLiveTracking();
        showToast("📡 กำลังค้นหาตำแหน่ง...", "กรุณารอรับสัญญาณ GPS สักครู่");
    }
}

function fitAllBuildingPins() {
    if (!leafletMap || leafletMarkers.length === 0) return;
    if (isTogglingOverview) return;
    isTogglingOverview = true;
    setTimeout(() => { isTogglingOverview = false; }, 600);

    leafletMap.closePopup();
    activePopupLocId = null;

    // ตรวจสอบจากระดับ Zoom ปัจจุบันของแผนที่:
    // - ถ้า Zoom <= 13 (แสดงว่าอยู่ในมุมมองกว้างครอบคลุมหลายวิทยาเขต) -> สลับไปซูมเข้า "เฉพาะภายใน รพ.ศิริราช"
    // - ถ้า Zoom > 13 (แสดงว่าอยู่ในมุมมองใกล้ รพ.ศิริราช หรือกำลังดูเฉพาะตึก) -> สลับไป "ภาพรวมทุกวิทยาเขต"
    const currentZoom = leafletMap.getZoom();
    const shouldZoomToSiriraj = (currentZoom <= 13);

    if (shouldZoomToSiriraj) {
        // 1. ซูมเข้าเฉพาะอาคารภายในโรงพยาบาลศิริราช (24 อาคาร)
        const localLocs = getLocalClusterLocations();
        const localIds = new Set(localLocs.map(l => l.id));
        const localMarkers = leafletMarkers.filter(m => m._locationData && localIds.has(m._locationData.id));

        const targetMarkers = localMarkers.length > 0 ? localMarkers : leafletMarkers;
        const group = L.featureGroup(targetMarkers);

        if (userLocation.hasRealGPS && userLeafletMarker) {
            const nearest = getNearestLocation();
            // นำหมุดตำแหน่งผู้ใช้มารวมจัดเฟรมเฉพาะเมื่ออยู่ในระยะเดินเท้าใกล้ รพ. (<= 500 ม.)
            // เพื่อไม่ให้ดึงเฟรมแผนที่ซูมออกกว้างเกินไปเมื่อผู้ใช้อยู่นอกพื้นที่ เช่น นั่งรถอยู่ 2-3 กม.
            if (nearest && nearest.distanceMeters <= 500) {
                group.addLayer(userLeafletMarker);
            }
        }

        leafletMap.fitBounds(group.getBounds().pad(0.12), { animate: true });

        const isMainHosp = localLocs.every(l => isInsideSirirajHospital(l));
        const clusterName = isMainHosp 
            ? "จุดแตะบัตรภายในโรงพยาบาลศิริราช" 
            : (localLocs[0]?.name || "พื้นที่ใกล้คุณ");
        showToast(`📍 ${clusterName}`, "กดอีกครั้งเพื่อดูจุดแตะบัตรทั้งหมด", "🏥");
        updateOverviewButtonUI(false);
    } else {
        // 2. ขยายมุมมองภาพรวมทุกวิทยาเขต (ทุกจุดแตะบัตร รวมศาลายา, สมุทรสาคร, ICS, ปฐมภูมิ, กายอุปกรณ์)
        const group = L.featureGroup(leafletMarkers);
        if (userLocation.hasRealGPS && userLeafletMarker) {
            group.addLayer(userLeafletMarker);
        }

        leafletMap.fitBounds(group.getBounds().pad(0.1), { animate: true });
        showToast("📍 จุดแตะบัตรทั้งหมด", "กดอีกครั้งเพื่อดูจุดแตะบัตรภายในโรงพยาบาลศิริราช", "🗺️");
        updateOverviewButtonUI(true);
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
    recalculateAndRender();
    startLiveTracking();     // Continuous real-time GPS tracking
    startSlideshowTimer();   // Continuous automatic slideshow between image1 & image2
    adjustFloatingButtonPosition();
    handleSharedBuildingParam(); // Scroll to building if ?bldg=X or ?id=X is present in URL
};
