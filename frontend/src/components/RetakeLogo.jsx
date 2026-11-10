// Retake Gym: the full Retake Gym logo (symbol + wordmark) for the sign-in screens. Both variants
// are drawn and the theme picks one (index.css .retake-logo), so it is right the moment the
// theme changes, with no flash of the other.
import dark from '../assets/retake-gym-logo-dark.svg'
import light from '../assets/retake-gym-logo-light.svg'

export default function RetakeLogo({ width = 260 }) {
  return <div className="retake-logo" style={{ width, maxWidth: '80%', margin: '0 auto 6px' }}>
    <img className="retake-logo-dark" src={dark} alt="Retake Gym" width={width} style={{ width: '100%', height: 'auto' }} />
    <img className="retake-logo-light" src={light} alt="Retake Gym" width={width} style={{ width: '100%', height: 'auto' }} />
  </div>
}
