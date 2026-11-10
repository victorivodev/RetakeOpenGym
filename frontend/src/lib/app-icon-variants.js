// The home-screen icons a phone can switch to (Settings → Look & Home → App icon). Plain data, no
// imports: scripts/app-icons.mjs draws every icon file from this list and the settings row lists
// the same ids, so the picker can never offer an icon the native projects do not have.
//
// `name` is the English key the row passes to t(). `ios` is the AppIcon set in the asset catalog
// (null: the primary icon) and `android` the activity-alias in AndroidManifest.xml. `art` is a
// hand-made SVG the script renders instead of the mark; `bg`/`fg` are then just its main colours.
// `nib` colours the pen nib when it differs from `fg`. The ids stay those of openGym, so a phone
// that picked one keeps it.
export const APP_ICON_VARIANTS = [
  { id: 'default', name: 'Original', bg: '#0c1324', fg: '#e8cc85', ios: null, android: 'IconDefault' },
  { id: 'light', name: 'Light', bg: '#ffffff', fg: '#32658a', nib: '#c9a24a', ios: 'AppIcon-Light', android: 'IconLight' },
  { id: 'mono', name: 'Mono', bg: '#0c1324', fg: '#dce1fb', ios: 'AppIcon-Mono', android: 'IconMono' },
  { id: 'neon', name: 'Gold', bg: '#e8cc85', fg: '#0c1324', ios: 'AppIcon-Neon', android: 'IconNeon' },
  { id: 'sky', name: 'Blue', bg: '#32658a', fg: '#ffffff', nib: '#e8cc85', ios: 'AppIcon-Sky', android: 'IconSky' },
  { id: 'orange', name: 'Orange', bg: '#ffb95f', fg: '#0c1324', ios: 'AppIcon-Orange', android: 'IconOrange' },
  { id: 'pink', name: 'Pink', bg: '#ff375f', fg: '#ffffff', ios: 'AppIcon-Pink', android: 'IconPink' },
  { id: 'violet', name: 'Purple', bg: '#bf5af2', fg: '#ffffff', ios: 'AppIcon-Violet', android: 'IconViolet' },
  // All year, Halloween theme or not: some people are spooky in March.
  { id: 'halloween', name: 'Halloween', bg: '#0d0517', fg: '#ff7a1a', art: 'resources/icons/halloween.svg', ios: 'AppIcon-Halloween', android: 'IconHalloween' },
  // The same for Christmas: a Santa hat in July is nobody's business but yours.
  { id: 'christmas', name: 'Christmas', bg: '#070b16', fg: '#e8cc85', art: 'resources/icons/christmas.svg', ios: 'AppIcon-Christmas', android: 'IconChristmas' },
]

export const APP_ICON_IDS = APP_ICON_VARIANTS.map(v => v.id)
