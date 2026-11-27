// Design tokens for the app. Font family is intentionally left unset here
// so Grommet inherits the system font stack declared in src/index.css —
// that avoids the extra network requests a custom webfont would add on
// every first load.
export const theme = {
  name: 'local-podcasts',
  rounding: 10,
  spacing: 24,
  defaultMode: 'dark',
  global: {
    colors: {
      brand: '#FF5A3C',
      background: {
        dark: '#0c0d0f',
        light: '#f5f6f7',
      },
      'background-back': {
        dark: '#0c0d0f',
        light: '#eceeef',
      },
      'background-front': {
        dark: '#1a1c1f',
        light: '#ffffff',
      },
      'background-contrast': {
        dark: '#ffffff0f',
        light: '#0000000a',
      },
      text: {
        dark: '#e8e9ea',
        light: '#1c1e21',
      },
      'text-strong': {
        dark: '#ffffff',
        light: '#000000',
      },
      'text-weak': {
        dark: '#9a9ea3',
        light: '#5b6066',
      },
      'text-xweak': {
        dark: '#6b6f74',
        light: '#8a8f94',
      },
      border: {
        dark: '#2a2d31',
        light: '#e2e4e6',
      },
      control: {
        light: '#e24f30',
        dark: '#ff5a3c',
      },
      'accent-1': '#ff5a3c',
      'active-background': 'background-contrast',
      'active-text': 'text-strong',
      'selected-background': 'accent-1',
      'selected-text': '#ffffff',
      'status-critical': '#e03e2d',
      'status-warning': '#f0c954',
      'status-ok': '#2bb673',
      'status-unknown': '#9a9ea3',
      'status-disabled': '#9a9ea3',
    },
    font: {
      size: '15px',
      height: '22px',
    },
    active: {
      background: 'active-background',
      color: 'active-text',
    },
    hover: {
      background: 'active-background',
      color: 'active-text',
    },
    selected: {
      background: 'selected-background',
      color: 'selected-text',
    },
    focus: {
      outline: {
        color: '#ff5a3c55',
        size: '2px',
      },
      border: {
        color: '#ff5a3c',
      },
    },
    edgeSize: {
      hair: '1px',
    },
  },
  heading: {
    font: {
      weight: 700,
    },
    level: {
      1: { medium: { size: '34px', height: '40px' } },
      2: { medium: { size: '24px', height: '30px' } },
      3: { medium: { size: '18px', height: '24px' } },
      4: { medium: { size: '15px', height: '20px' } },
    },
  },
  button: {
    border: { radius: '8px' },
    padding: { vertical: '6px', horizontal: '14px' },
  },
  card: {
    container: {
      round: 'medium',
    },
  },
  textInput: {
    extend: 'caret-color: #ff5a3c;',
  },
  checkBox: {
    toggle: {
      color: 'accent-1',
    },
    color: 'accent-1',
  },
  layer: {
    background: {
      dark: '#111111',
      light: '#FFFFFF',
    },
  },
}

// Flat elevated-surface background used for cards, the player bar, and
// drawers — replaces a legacy decorative pattern image that added weight
// to every card without much visual value.
export const background = { color: 'background' }
export const cardBackground = { color: 'background-front' }
