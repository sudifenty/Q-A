/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      /* The old theme was Tailwind's default indigo with nothing behind it.
         This is a real palette: a deep teal that stays legible on a phone
         outdoors, plus a warm amber used only for things that need attention. */
      colors: {
        brand: {
          50:  '#effcf9',
          100: '#d5f6ee',
          200: '#aeece0',
          300: '#76dbcc',
          400: '#3cc2b1',
          500: '#1ca797',
          600: '#0f867c',
          700: '#106b64',
          800: '#125550',
          900: '#134743',
          950: '#042b28'
        },
        accent: {
          50:  '#fffaeb',
          100: '#fef1c6',
          200: '#fde289',
          300: '#fccd4c',
          400: '#fbb623',
          500: '#f99307',
          600: '#dd6c02',
          700: '#b74a06',
          800: '#94390c',
          900: '#7a300d'
        },
        /* semantic surfaces, so dark mode is one switch and not 40 edits */
        surface: {
          page:    'var(--sp-page)',
          raised:  'var(--sp-raised)',
          sunken:  'var(--sp-sunken)',
          line:    'var(--sp-line)',
          ink:     'var(--sp-ink)',
          muted:   'var(--sp-muted)',
          faint:   'var(--sp-faint)'
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system',
               'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif']
      },
      fontSize: {
        /* comfortable: the base step is larger than Tailwind's default */
        xs:   ['0.8125rem', { lineHeight: '1.25rem' }],
        sm:   ['0.9375rem', { lineHeight: '1.5rem' }],
        base: ['1.0625rem', { lineHeight: '1.75rem' }],
        lg:   ['1.1875rem', { lineHeight: '1.875rem' }],
        xl:   ['1.375rem',  { lineHeight: '1.875rem' }],
        '2xl':['1.75rem',   { lineHeight: '2.125rem' }],
        '3xl':['2.25rem',   { lineHeight: '2.5rem' }]
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem'
      },
      boxShadow: {
        card:  '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)',
        lift:  '0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 10px 20px -4px rgba(15, 23, 42, 0.08)',
        pop:   '0 12px 32px -8px rgba(15, 23, 42, 0.22)'
      },
      spacing: {
        gutter: '1.25rem'
      }
    }
  },
  plugins: []
};
