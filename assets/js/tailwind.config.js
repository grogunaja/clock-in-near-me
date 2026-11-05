/* ==========================================
   Tailwind CSS Custom Configuration
   ========================================== */

tailwind.config = {
    theme: {
        extend: {
            fontFamily: {
                sans: ['Kanit', 'sans-serif'],
                display: ['Mitr', 'sans-serif'],
            },
            colors: {
                pop: {
                    bg: '#FFFDF7',
                    yellow: '#FFD166',
                    pink: '#FF5D8F',
                    purple: '#8338EC',
                    blue: '#3A86FF',
                    mint: '#06D6A0',
                    orange: '#FB5607',
                    dark: '#1E1B2E'
                }
            },
            boxShadow: {
                'neo': '4px 4px 0px 0px #1E1B2E',
                'neo-lg': '6px 6px 0px 0px #1E1B2E',
                'neo-sm': '2px 2px 0px 0px #1E1B2E',
            }
        }
    }
};

