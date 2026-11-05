// ==========================================
// SIRIRAJ HOSPITAL CHECK-IN LOCATIONS DATA
// ==========================================
const baseLocations = [
    {
        id: 1,
        name: "อาคารนวมินทรบพิตร ๘๔ พรรษา",
        category: "ตึกตรวจรักษา/OPD",
        gateInfo: "ชั้น G โถงลิฟต์หลักฝั่งทิศใต้ และชั้น B1 ทางเข้าบุคลากร",
        openHours: "ตลอด 24 ชั่วโมง (ทุกผลัดเวร)",
        lat: 13.7579,
        lng: 100.4842,
        accentColor: "bg-pop-yellow",
        badgeColor: "bg-pop-pink text-white",
        image: "https://images.unsplash.com/photo-1587351021759-3e566b6af7cc?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 2,
        name: "ตึกผู้ป่วยนอก (OPD Building)",
        category: "ตึกตรวจรักษา/OPD",
        gateInfo: "ชั้น G โถงกลางข้างประชาสัมพันธ์ และชั้น 1 ทางเชื่อม Skywalk",
        openHours: "05:00 - 22:00 น. (ชั้น G เปิด 24 ชม.)",
        lat: 13.7565,
        lng: 100.4851,
        accentColor: "bg-pop-mint",
        badgeColor: "bg-pop-purple text-white",
        image: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 3,
        name: "ตึกสยามินทร์ (Syamindra Building)",
        category: "บริหาร/การศึกษา",
        gateInfo: "ชั้น 1 โถงหน้าลิฟต์หลัก ข้างทางขึ้นห้องประชุมราชปนัดดาฯ",
        openHours: "ตลอด 24 ชั่วโมง",
        lat: 13.7571,
        lng: 100.4856,
        accentColor: "bg-pop-pink",
        badgeColor: "bg-pop-yellow text-pop-dark",
        image: "https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 4,
        name: "ตึกเฉลิมพระเกียรติ",
        category: "ตึกตรวจรักษา/OPD",
        gateInfo: "ชั้น 1 โถงหน้าลิฟต์บุคลากร (ฝั่งตรงข้ามลานพระราชานุสาวรีย์ฯ)",
        openHours: "ตลอด 24 ชั่วโมง",
        lat: 13.7582,
        lng: 100.4859,
        accentColor: "bg-pop-blue",
        badgeColor: "bg-pop-mint text-pop-dark",
        image: "https://images.unsplash.com/photo-1538108149393-fbbd81895907?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 5,
        name: "ตึกอำนวยการ (Administration)",
        category: "บริหาร/การศึกษา",
        gateInfo: "ชั้น 1 โถงกลาง หน้าฝ่ายทรัพยากรบุคคล (HR)",
        openHours: "06:00 - 20:00 น.",
        lat: 13.7573,
        lng: 100.4851,
        accentColor: "bg-pop-purple",
        badgeColor: "bg-pop-yellow text-pop-dark",
        image: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 6,
        name: "ตึกอัษฎางค์ (Asadang Building)",
        category: "หอผู้ป่วยใน/IPD",
        gateInfo: "ชั้น 1 โถงทางเดินกลาง ฝั่งหอผู้ป่วยอายุรศาสตร์",
        openHours: "ตลอด 24 ชั่วโมง (รับ-ส่งเวร)",
        lat: 13.7561,
        lng: 100.4861,
        accentColor: "bg-pop-orange",
        badgeColor: "bg-white text-pop-dark",
        image: "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 7,
        name: "ตึกศรีสังวาลย์ (Srisangwan)",
        category: "หอผู้ป่วยใน/IPD",
        gateInfo: "ชั้น G หน้าโถงลิฟต์ ข้างศูนย์เวชศาสตร์ฟื้นฟู (ใกล้ท่าวังหลัง)",
        openHours: "ตลอด 24 ชั่วโมง",
        lat: 13.7568,
        lng: 100.4865,
        accentColor: "bg-pop-yellow",
        badgeColor: "bg-pop-blue text-white",
        image: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 8,
        name: "ตึกเจ้าฟ้ามหาจักรี (กุมารเวชศาสตร์)",
        category: "หอผู้ป่วยใน/IPD",
        gateInfo: "ชั้น 1 โถงลิฟต์หลัก ภาควิชากุมารเวชศาสตร์",
        openHours: "ตลอด 24 ชั่วโมง",
        lat: 13.7576,
        lng: 100.4866,
        accentColor: "bg-pop-mint",
        badgeColor: "bg-pop-pink text-white",
        image: "https://images.unsplash.com/photo-1504439468489-c8920d796a29?auto=format&fit=crop&w=800&q=80"
    },
    {
        id: 9,
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
        id: 10,
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

