// Data sluneční soustavy.
//
// Zdroje: poloměry, doby rotace a sklony os z NASA Planetary Fact Sheet;
// dráhy ze středních dráhových prvků JPL („Approximate Positions of the
// Planets") k epoše J2000 – díky nim stojí planety zhruba tam, kde opravdu jsou.
//
// Jednotky: vzdálenosti a poloměry v milionech km (Gm), doby ve dnech,
// úhly ve stupních. Dráhy jsou elipsy se skutečnou výstředností.

const AU = 149.5978707; // Gm

/**
 * Každé těleso:
 * - `radius` – střední poloměr, `mass` – hmotnost v kg (určuje oběh těles kolem něj)
 * - `parent` – kolem čeho obíhá; `a` velká poloosa dráhy, `period` oběžná doba
 * - `inclination`, `node` – sklon dráhy k ekliptice a délka výstupného uzlu
 * - `meanLongitude` – střední délka v epoše J2000 (kde na dráze těleso bylo)
 * - `eccentricity` – výstřednost, `perihelion` – délka pericentra ϖ (kam míří elipsa);
 *   u Měsíce se pericentrum i uzel rychle stáčejí, bere se hodnota v J2000
 * - `spin` – doba otočky kolem osy, `tilt` – sklon osy (> 90° = otáčí se obráceně)
 * - `material` + `color`, u plynných obrů `bands` = [kontrast, hustota pásů]
 */
export const SOLAR_SYSTEM = [
  {
    id: 'sun', name: 'Slunce', material: 'star',
    mass: 1.989e30, radius: 0.6957, color: [1.0, 0.93, 0.82], temperature: 5772,
    spin: 25.38, tilt: 7.25,
  },
  {
    id: 'mercury', name: 'Merkur', parent: 'sun', material: 'rock',
    mass: 3.301e23, radius: 0.0024397, color: [0.55, 0.53, 0.5],
    a: 0.3871 * AU, period: 87.969, inclination: 7.005, node: 48.331, meanLongitude: 252.251,
    eccentricity: 0.20563593, perihelion: 77.45779628,
    spin: 58.646, tilt: 0.03,
  },
  {
    id: 'venus', name: 'Venuše', parent: 'sun', material: 'gas',
    mass: 4.867e24, radius: 0.0060518, color: [0.93, 0.84, 0.62], bands: [0.06, 5],
    a: 0.72333 * AU, period: 224.701, inclination: 3.395, node: 76.68, meanLongitude: 181.979,
    eccentricity: 0.00677672, perihelion: 131.60246718,
    spin: 243.025, tilt: 177.36,
  },
  {
    id: 'earth', name: 'Země', parent: 'sun', material: 'earth',
    mass: 5.972e24, radius: 0.006371, color: [0.28, 0.48, 0.85],
    a: 1.0 * AU, period: 365.256, inclination: 0, node: 0, meanLongitude: 100.465,
    eccentricity: 0.01671123, perihelion: 102.93768193,
    spin: 0.99727, tilt: 23.44,
  },
  {
    id: 'moon', name: 'Měsíc', parent: 'earth', material: 'rock',
    mass: 7.342e22, radius: 0.0017374, color: [0.6, 0.59, 0.57],
    a: 0.3844, period: 27.3217, inclination: 5.145, node: 125.045, meanLongitude: 218.316,
    eccentricity: 0.0549, perihelion: 83.353,
    spin: 27.3217, tilt: 6.68,
  },
  {
    id: 'mars', name: 'Mars', parent: 'sun', material: 'rock',
    mass: 6.417e23, radius: 0.0033895, color: [0.78, 0.42, 0.25],
    a: 1.52371 * AU, period: 686.98, inclination: 1.85, node: 49.56, meanLongitude: -4.553,
    eccentricity: 0.0933941, perihelion: -23.94362959,
    spin: 1.02596, tilt: 25.19,
  },
  {
    id: 'jupiter', name: 'Jupiter', parent: 'sun', material: 'gas',
    mass: 1.898e27, radius: 0.069911, color: [0.85, 0.72, 0.55], bands: [0.35, 16],
    a: 5.20289 * AU, period: 4332.59, inclination: 1.304, node: 100.474, meanLongitude: 34.396,
    eccentricity: 0.04838624, perihelion: 14.72847983,
    spin: 0.41354, tilt: 3.13,
  },
  {
    id: 'saturn', name: 'Saturn', parent: 'sun', material: 'gas',
    mass: 5.683e26, radius: 0.058232, color: [0.9, 0.82, 0.6], bands: [0.15, 14], rings: [1.239, 2.27],
    a: 9.53668 * AU, period: 10759.22, inclination: 2.486, node: 113.662, meanLongitude: 49.954,
    eccentricity: 0.05386179, perihelion: 92.59887831,
    spin: 0.44401, tilt: 26.73,
  },
  {
    id: 'uranus', name: 'Uran', parent: 'sun', material: 'gas',
    mass: 8.681e25, radius: 0.025362, color: [0.62, 0.86, 0.9], bands: [0.04, 8],
    a: 19.18917 * AU, period: 30685.4, inclination: 0.773, node: 74.017, meanLongitude: 313.238,
    eccentricity: 0.04725744, perihelion: 170.9542763,
    spin: 0.71833, tilt: 97.77,
  },
  {
    id: 'neptune', name: 'Neptun', parent: 'sun', material: 'gas',
    mass: 1.024e26, radius: 0.024622, color: [0.3, 0.48, 0.95], bands: [0.12, 10],
    a: 30.06993 * AU, period: 60189, inclination: 1.77, node: 131.784, meanLongitude: -55.12,
    eccentricity: 0.00859048, perihelion: 44.96476227,
    spin: 0.67125, tilt: 28.32,
  },
];
