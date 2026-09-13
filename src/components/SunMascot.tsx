import Svg, { Circle, G, Path } from 'react-native-svg';

// Protocol Tracker's mascot, drawn as vectors rather than shipped as a PNG so
// it stays sharp at any size and costs nothing to rescale. Same geometry as
// assets/mascot/sun-mascot.svg — keep the two in step if either changes.
//
// The face is painted, not knocked out: a knockout takes the colour of whatever
// sits behind it, which put a white face on the app's cream ground.
//
// `rays`, `body` and the face are separate groups so an animation can turn the
// rays or blink the eyes without touching the rest.
//
// Placement is written as SVG `transform` strings rather than the `rotation` /
// `translateX` / `origin` props react-native-svg also accepts. Those props are
// non-spec: on web the shim turns `origin` into a literal `transform-origin`
// DOM attribute and passes `rotation`/`translateX`/`translateY` straight
// through, so React logged an invalid-property warning on every screen that
// draws the mascot. Every origin here was already `0, 0`, so the geometry is
// unchanged, and native parses transform strings the same way.

const AMBER = '#E9A23C';
const INK = '#14213D';

/** One ray, pointing along +x, with a rounded tip. Rotated into place below. */
const RAY = 'M 185.1 -67.4 Q 306.6 -80.0 386.0 -44.0 A 44.0 44.0 0 0 1 386.0 44.0 Q 306.6 80.0 185.1 67.4 Z';
const RAY_ANGLES = [-90, -45, 0, 45, 90, 135, 180, 225];

const EYE_LEFT = 'M -114 -38 Q -76 -92 -38 -38';
const EYE_RIGHT = 'M 38 -38 Q 76 -92 114 -38';
const MOUTH = 'M -62 46 Q 0 116 62 46';

interface Props {
  /** Rendered width and height in points. */
  size?: number;
  /** Turn the rays, in degrees. The face stays upright. */
  rayRotation?: number;
}

export default function SunMascot({ size = 66, rayRotation = 0 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityRole="image">
      <G transform="translate(512, 512)">
        <G transform={`rotate(${rayRotation})`}>
          {RAY_ANGLES.map((a) => (
            <Path key={a} d={RAY} fill={AMBER} transform={`rotate(${a})`} />
          ))}
        </G>
        <Circle cx={0} cy={0} r={215} fill={AMBER} />
        <G fill="none" stroke={INK} strokeLinecap="round">
          <Path d={EYE_LEFT} strokeWidth={24} />
          <Path d={EYE_RIGHT} strokeWidth={24} />
          <Path d={MOUTH} strokeWidth={26} />
        </G>
      </G>
    </Svg>
  );
}
