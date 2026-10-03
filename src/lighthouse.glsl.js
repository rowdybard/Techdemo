// Lighthouse shaders: painted steel and concrete lit like the sand (sky fill, afterglow,
// fireworks, and the lantern's own glow), the lantern's glass with the lens shining
// behind it, the lamp's glare, and the beams seen in the haze. The beam light is shared
// with the smoke, so a beam sweeping through a cloud lights a band across it.
import { noiseGLSL, skyGLSL } from './glsl.js';
import { burstLightGLSL } from './burstlights.js';

// The two beams (the second points opposite the first): light arriving at a point and
// scattered toward the eye. Haze and smoke scatter mostly forward, so a beam swinging
// toward you brightens many times over. Distances are worked in hundreds of metres, so
// they hold up on GPUs with low float precision.
export const beamGLSL = /* glsl */ `
  uniform vec3 uBeamOrigin;
  uniform vec3 uBeamDir;
  uniform vec3 uBeamColor; // colour times brightness; black when the light is off
  uniform vec2 uBeamShape; // radius at the lens (m), and how much it widens per metre

  // Henyey-Greenstein (g = 0.45) mixed with a little even scattering; 1 side-on.
  float beamPhase(vec3 axis, vec3 toEye) {
    return 0.3 + 0.923 / pow(1.2025 - 0.9 * dot(axis, toEye), 1.5);
  }

  vec3 beamLight(vec3 p, vec3 toEye) {
    vec3 rel = (p - uBeamOrigin) * 0.01;
    float s = dot(rel, uBeamDir);
    vec3 axis = s < 0.0 ? -uBeamDir : uBeamDir;
    s = abs(s);
    float w = uBeamShape.x * 0.01 + uBeamShape.y * s;
    float off = max(dot(rel, rel) - s * s, 0.0);
    // Thinner as it spreads, and dimmed by the air it has crossed.
    float strength = 3.0 / (w * 100.0 + 2.0) * exp(-s * 0.3);
    return uBeamColor * exp(-off / (w * w)) * strength * beamPhase(axis, toEye);
  }
`;

export const worldVertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = mat3(modelMatrix) * normal;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// Twilight light, as on the sand, shared by the structure and the lantern glass.
const twilightGLSL = /* glsl */ `
  vec3 skyFill(vec3 n) {
    vec3 fill = skyZenith() * 1.8 + skyGradient(vec3(0.0, 0.3, 0.0)) * 0.5;
    vec3 glowDirection = normalize(vec3(uSunDirection.x, 0.12, uSunDirection.z));
    vec3 glowColor = skyGradient(normalize(vec3(uSunDirection.x, 0.02, uSunDirection.z))) * 0.42;
    return fill * (0.55 + 0.45 * n.y) + glowColor * max(dot(n, glowDirection), 0.0);
  }

  vec3 skySheen(vec3 view, vec3 n) {
    vec3 r = reflect(-view, n);
    return skyGradient(vec3(r.x, abs(r.y), r.z));
  }

  float fresnelOf(vec3 view, vec3 n) {
    return 0.04 + 0.96 * pow(1.0 - clamp(dot(view, n), 0.0, 1.0), 5.0);
  }
`;

export const structureFragment = /* glsl */ `
  ${noiseGLSL}
  ${skyGLSL}
  ${burstLightGLSL}
  ${twilightGLSL}
  uniform vec3 uColor;
  uniform float uSheen; // painted steel shines, concrete hardly does
  uniform float uGrime; // rust streaks, and darker low down where the waves reach
  uniform vec3 uLampPosition;
  uniform vec3 uLampGlow; // the lantern's light on what's around it
  varying vec3 vWorld;
  varying vec3 vNormal;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 toEye = cameraPosition - vWorld;
    float distance = length(toEye);
    vec3 view = toEye / distance;
    float streak = valueNoise(vec2((vWorld.x + vWorld.z) * 3.0, vWorld.y * 0.3));
    float splash = 1.0 - smoothstep(0.5, 6.0, vWorld.y);
    vec3 albedo = uColor * (1.0 - uGrime * (0.35 * streak + 0.35 * splash));

    vec3 light = skyFill(n) + burstDiffuse(vWorld, n) * 0.06;
    // The lantern lights its gallery and the underside of its roof, not the tower below.
    vec3 toLamp = uLampPosition - vWorld;
    float lampDistance2 = dot(toLamp, toLamp);
    float above = smoothstep(uLampPosition.y - 1.5, uLampPosition.y - 1.1, vWorld.y);
    light += uLampGlow * above * max(dot(n, toLamp * inversesqrt(lampDistance2)), 0.0) * 4.0 / (1.0 + lampDistance2 * 0.35);
    vec3 color = albedo * light;

    // A sheen of the sky at grazing angles, and bursts glinting off the paint.
    vec3 r = reflect(-view, n);
    color += (skySheen(view, n) + burstReflection(vWorld, r, 30.0) * 0.03) * fresnelOf(view, n) * uSheen;

    vec3 haze = skyGradient(normalize(vec3(-view.x, 0.02, -view.z)));
    color = mix(color, haze, smoothstep(180.0, 900.0, distance) * 0.7);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// The lantern's panes: they mirror the sky, the room behind them glows, and the lens
// shines where the eye looks through toward it, blazing when a panel faces you.
export const lanternFragment = /* glsl */ `
  ${skyGLSL}
  ${twilightGLSL}
  uniform vec3 uLampPosition;
  uniform vec3 uLampGlow;
  uniform vec3 uBeamDir;
  varying vec3 vWorld;
  varying vec3 vNormal;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 toEye = cameraPosition - vWorld;
    vec3 view = normalize(toEye);
    vec3 color = skySheen(view, n) * (0.12 + 0.88 * fresnelOf(view, n));
    vec3 rel = uLampPosition - vWorld;
    vec3 miss = rel + view * dot(rel, -view);
    float lens = exp(-pow(length(miss * vec3(2.0, 1.45, 2.0)), 4.0));
    vec2 level = normalize(toEye.xz + 1e-4);
    float facing = abs(dot(level, normalize(uBeamDir.xz + 1e-4)));
    float room = 0.12 + 0.1 * exp(-rel.y * rel.y);
    color += uLampGlow * (room + lens * (1.2 + 5.0 * pow(facing, 16.0)));
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// The glare: a camera-facing quad of a fixed angular size, just in front of the lantern.
export const glareVertex = /* glsl */ `
  uniform vec3 uLampPosition;
  uniform float uGlareSize; // angular radius, radians
  varying vec2 vUv;
  void main() {
    vec3 toEye = cameraPosition - uLampPosition;
    float distance = length(toEye);
    vec3 center = uLampPosition + toEye / distance * min(2.2, distance * 0.5);
    vec4 view = viewMatrix * vec4(center, 1.0);
    view.xy += position.xy * distance * uGlareSize;
    gl_Position = projectionMatrix * view;
    vUv = position.xy;
  }
`;

export const glareFragment = /* glsl */ `
  uniform vec3 uGlareColor;
  varying vec2 vUv;
  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    // A hot core, a soft halo as the haze around a bright light glows, and a faint
    // level streak, the way a bright point looks to the eye.
    float glow = exp(-r * r * 140.0) * 3.0 + exp(-r * 6.0) * 0.3 * (1.0 - r);
    glow += exp(-abs(vUv.y) * 90.0) * (1.0 - r) * (1.0 - r) * 0.15;
    gl_FragColor = vec4(uGlareColor * glow, 1.0);
  }
`;

// The beams in the haze. Each is drawn as a cone a few times wider than the beam, and
// each pixel adds up the light its view ray picks up crossing the beam. Seen from the
// cone's apex (a little behind the lens) the beam is a Gaussian spread of angles, and
// along any ray that angle is linear in 1/distance, so the sum comes out exactly as a
// pair of error functions: a soft shaft side-on, thinning as it widens, and a glow
// around the lamp when it points at you. A pixel is drawn by the cone's near side, or
// its far side when the eye is inside the cone, so it's counted once. Hundreds of
// metres again, for precision.
export const shaftVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const shaftFragment = /* glsl */ `
  ${beamGLSL}
  uniform float uLength; // metres
  uniform float uBound; // the cone is this many beam radii wide
  uniform float uHaze; // how much the air scatters
  varying vec3 vWorld;

  // Error function, to about 1e-4 (Winitzki's approximation).
  float erfApprox(float x) {
    float x2 = x * x;
    return sign(x) * sqrt(1.0 - exp(-x2 * (1.2732 + 0.147 * x2) / (1.0 + 0.147 * x2)));
  }

  void main() {
    vec3 axis = dot(vWorld - uBeamOrigin, uBeamDir) < 0.0 ? -uBeamDir : uBeamDir;
    float k = uBeamShape.y;
    float lens = uBeamShape.x * 0.01 / k; // from the apex to the lens
    float far = lens + uLength * 0.01;
    vec3 eye = (cameraPosition - uBeamOrigin) * 0.01 + axis * lens;
    float sEye = dot(eye, axis);
    vec3 u = eye - axis * sEye;
    bool inside = sEye > lens && sEye < far && length(u) < k * sEye * uBound;
    if (!gl_FrontFacing && !inside) discard;

    vec3 ray = normalize(vWorld - cameraPosition);
    float b = dot(ray, axis);
    vec3 vp = ray - axis * b;
    // The stretch of beam the ray crosses, by distance from the apex.
    float sNear = b > 0.0 ? max(sEye, lens) : lens;
    float sFar = b > 0.0 ? far : min(sEye, far);
    if (sFar <= sNear) discard;
    vec3 c = b * u - sEye * vp;
    float cl = max(length(c), 0.002);
    vec3 twist = cross(u, vp);
    float nearest = dot(twist, twist) / (cl * cl); // smallest angle off the axis, squared
    float x0 = -dot(c, vp) / (cl * cl); // 1/distance where it's smallest
    float scale = cl / (max(abs(b), 1e-4) * k);
    float crossed = erfApprox((1.0 / sNear - x0) * scale) - erfApprox((1.0 / sFar - x0) * scale);
    float s = 1.0 / clamp(x0, 1.0 / sFar, 1.0 / sNear);
    float fade = exp(-(s - lens) * 0.35) * (1.0 - smoothstep(lens + uLength * 0.0055, far, s));
    float light = exp(-nearest / (k * k)) * crossed / (3.545 * k * cl) * fade * 0.025;
    gl_FragColor = vec4(uBeamColor * light * beamPhase(axis, -ray) * uHaze, 1.0);
  }
`;
