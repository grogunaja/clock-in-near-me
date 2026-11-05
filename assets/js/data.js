// ==========================================
// SIRIRAJ HOSPITAL CHECK-IN LOCATIONS DATA
// ==========================================
const baseLocations = [
    {
        id: 1,
        name: "ตึกชัยนาทนเรนทรานุสรณ์",
        category: "บริหาร/การศึกษา",
        gateInfo: "ชั้น 1 ทางเข้า",
        openHours: "ตลอด 24 ชั่วโมง",
        lat: 13.757155378765418,
        lng: 100.48634660009508,
        accentColor: "bg-pop-yellow",
        badgeColor: "bg-pop-pink text-white",
        image: "https://images.unsplash.com/photo-1587351021759-3e566b6af7cc?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 2,
        name: "ตึกอัษฎางค์",
        category: "ตึกตรวจรักษา/OPD",
        gateInfo: "ชั้น 1",
        openHours: "05:00 - 22:00 น. (ชั้น G เปิด 24 ชม.)",
        lat: 13.756736364954378,
        lng: 100.48574873969562,
        accentColor: "bg-pop-mint",
        badgeColor: "bg-pop-purple text-white",
        image: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 3,
        name: "อาคาร 100 ปี สมเด็จพระศรีนครินทร์",
        category: "หอผู้ป่วยใน/IPD",
        gateInfo: "ชั้น 1",
        openHours: "ตลอด 24 ชั่วโมง",
        lat: 13.756971148267858,
        lng: 100.48534031993853,
        accentColor: "bg-pop-pink",
        badgeColor: "bg-pop-yellow text-pop-dark",
        image: "https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 4,
        name: "ตึก 72 ปี",
        category: "ตึกตรวจรักษา/OPD",
        gateInfo: "ชั้น 1",
        openHours: "ตลอด 24 ชั่วโมง",
        lat: 13.757296419023733,
        lng: 100.48497354010739,
        accentColor: "bg-pop-blue",
        badgeColor: "bg-pop-mint text-pop-dark",
        image: "https://images.unsplash.com/photo-1538108149393-fbbd81895907?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 5,
        name: "ตึกเจ้าฟ้ามหาจักรี (กุมารเวชศาสตร์)",
        category: "ตึกตรวจรักษา/OPD",
        gateInfo: "ชั้น 1 (ข้างร้าน S&P)",
        openHours: "ตลอด 24 ชั่วโมง",
        lat: 13.75697251221049,
        lng: 100.48465102015224,
        accentColor: "bg-pop-purple",
        badgeColor: "bg-pop-yellow text-pop-dark",
        image: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 6,
        name: "ตึกอานันทมหิดล",
        category: "หอผู้ป่วยใน/IPD",
        gateInfo: "ชั้น 1 (ใกล้กับทางขึ้น Skywalk)",
        openHours: "ตลอด 24 ชั่วโมง",
        lat: 13.756142666187186,
        lng: 100.48448268451688,
        accentColor: "bg-pop-orange",
        badgeColor: "bg-white text-pop-dark",
        image: "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 7,
        name: "ตึกผู้ป่วยนอก (ฝั่งป้ายรถเมล์)",
        category: "ตึกตรวจรักษา/OPD",
        gateInfo: "ชั้น 1 หน้าลิฟต์",
        openHours: "ตลอด 24 ชั่วโมง",
        lat: 13.756830656805871,
        lng: 100.48355470287662,
        accentColor: "bg-pop-yellow",
        badgeColor: "bg-pop-blue text-white",
        image: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 8,
        name: "ตึกผู้ป่วยนอก (???)",
        category: "ตึกตรวจรักษา/OPD",
        gateInfo: "ชั้นใต้ดิน",
        openHours: "ตลอด 24 ชั่วโมง",
        lat: 13.757015543859584,
        lng: 100.48354272362145,
        accentColor: "bg-pop-mint",
        badgeColor: "bg-pop-pink text-white",
        image: "https://images.unsplash.com/photo-1504439468489-c8920d796a29?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 9,
        name: "ตึกผู้ป่วยนอก (หน้าฝ่ายเภสัชกรรม)",
        category: "ตึกตรวจรักษา/OPD",
        gateInfo: "ชั้น 1",
        openHours: "ตลอด 24 ชั่วโมง",
        lat: 13.75708215060771,
        lng: 100.48347243241173,
        accentColor: "bg-pop-mint",
        badgeColor: "bg-pop-pink text-white",
        image: "https://images.unsplash.com/photo-1504439468489-c8920d796a29?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 10,
        name: "อาคารศรีสวรินทิรา (Srisavarindhira)",
        category: "บริหาร/การศึกษา",
        gateInfo: "ชั้น 1 โถงหน้าลิฟต์",
        openHours: "06:00 - 22:00 น.",
        lat: 13.758808409025352,
        lng: 100.48570951221583,
        accentColor: "bg-pop-pink",
        badgeColor: "bg-pop-yellow text-pop-dark",
        image: "https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 11,
        name: "ศูนย์วิจัยการแพทย์ศิริราช (SiMR)",
        category: "บริหาร/การศึกษา",
        gateInfo: "ชั้น G โซนทางเข้า",
        openHours: "ตลอด 24 ชั่วโมง",
        lat: 13.760438961302892,
        lng: 100.48516066430994,
        accentColor: "bg-pop-blue",
        badgeColor: "bg-pop-mint text-pop-dark",
        image: "https://images.unsplash.com/photo-1551076805-e1869033e561?auto=format&fit=crop&w=800&q=80"
    }
];

