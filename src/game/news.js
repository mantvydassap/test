import { PART_DEFS } from './projectCar.js';

const SIDE = [
  ['Elk on the move', 'A bull elk was seen crossing Highway 13 near the church on Tuesday. Drivers are asked to slow down at dusk.'],
  ['Dance at the youth hall', 'Kalevan Pojat play humppa on Saturday from 20:00. Tickets 8 mk at the door.'],
  ['Weather', 'Sunny and warm, 24 °C. Light wind from the south-west. The nights stay bright.'],
  ['Fuel prices up again', 'Petrol now costs 1,95 mk a litre in Kylänmäki. The shopkeeper blames OPEC and the government.'],
  ['Record catch', 'Local pensioner lands a 7-kilo pike from Haukilampi using a spoon lure he made himself.'],
  ['Inspection queues', 'The vehicle inspection office reminds motorists that it closes at 16 sharp.'],
];

function progress(game) {
  const pc = game.project;
  const n = PART_DEFS.filter((d) => pc.has(d.id)).length;
  return Math.round((n / PART_DEFS.length) * 100);
}

function pick(arr, n) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

export function deathStory(game, cause) {
  const S = game.survival;
  const pct = progress(game);
  const when = `on ${S.dateText().split(' ')[0]} at around ${S.clockText().slice(3)}`;
  const car = pct > 0 ? `Neighbours say the deceased had been rebuilding an uncle's Ruska 1300 coupé in the garage and that the car was "about ${pct} per cent there".` : 'The deceased had only recently moved into a relative\'s house outside the village.';
  const S2 = {
    hunger: ['Young resident starves to death at home', 'Police found the body in the house by Kotijärvi. The kitchen cupboards were empty.', ['The young resident had not been seen at the village shop for days, according to shopkeeper Teppo Laine. "Bought spark plugs once and that was it," Laine said.', 'Doctors remind that a working person needs three meals a day, and that sausage counts as one of them.']],
    thirst: ['Dehydration claims young resident in heatwave', 'The heatwave has now claimed its first victim in Kylänmäki.', ['The body was found near the house. Temperatures have reached 28 degrees this week.', 'Health authorities remind residents to drink plenty of water. "Beer is not water," a spokesman added.']],
    stress: ['Heart gives out at twenty: "He was under a lot of pressure"', 'A young resident of Kylänmäki suffered a fatal heart attack.', ['Friends describe someone who worried constantly and rarely rested.', 'Doctors recommend regular sauna, sleep and "not taking cars so seriously".']],
    crash: ['Fatal crash: young driver killed', 'The vehicle was found badly damaged. The driver died at the scene.', ['Police are investigating the cause of the accident. Speed is believed to have been a factor.', 'This is the third fatal accident in the parish this summer.']],
    traffic: ['Pedestrian struck and killed on Highway 13', 'A pedestrian on the main road was hit by a passing car.', ['The shaken driver told police the victim "appeared out of nowhere".', 'Police remind pedestrians to walk facing oncoming traffic and wear reflectors.']],
    runover: ['Resident run over by a vehicle in their own yard', 'An unusual accident at a homestead by Kotijärvi.', ['It appears the vehicle rolled while the victim was standing next to it.', 'Police advise always using the handbrake.']],
    drown: ['Swimmer drowns in the lake', 'The body was recovered by the volunteer fire brigade.', ['Witnesses say the swimmer had been drinking before going in.', 'The Swimming Federation repeats its warning: alcohol and water do not mix.']],
    fall: ['Fatal fall at local homestead', 'A young resident died after a fall.', ['The circumstances are still unclear.', 'Police do not suspect a crime.']],
    asleep: ['Driver falls asleep at the wheel', 'The driver is believed to have dozed off at the wheel.', ['The car left the road and the driver died.', 'Road safety officials urge drivers to rest before long journeys.']],
  }[cause] || ['Local resident dies in mysterious circumstances', 'Police are investigating.', ['Details are few.', 'Anyone with information is asked to contact the police.']];
  return {
    headline: S2[0],
    caption: `The scene ${when}.`,
    body: [S2[1] + ` It happened ${when}.`, car, ...S2[2]],
    side: pick(SIDE, 3),
  };
}

export function winStory(game) {
  const S = game.survival;
  return {
    headline: 'Rebuilt Ruska passes inspection',
    caption: `The Ruska 1300 at the Kylänmäki inspection hall, ${S.dateText()}.`,
    body: [
      `A young summer resident drove a fully rebuilt Ruska 1300 coupé into the inspection hall on ${S.dateText()}, and it passed.`,
      `The car had been sitting in pieces in a garage by Kotijärvi since last winter. "Every bolt was tight," said the inspector, visibly surprised. "Mixture, timing, lights, all correct."`,
      `The owner took ${S.day} day${S.day > 1 ? 's' : ''} to finish the job. The Ruska now carries the registration RUS-179.`,
      'Asked about plans for the rest of the summer, the new owner said: "Drive to the dance on Saturday, then heat the sauna."',
    ],
    side: pick(SIDE, 3),
  };
}
