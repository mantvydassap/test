# Midsummer Motors

A first-person car-building and survival game that runs in the browser, inspired by the
"rebuild a car in the Finnish countryside" genre.

It's the summer of 1979 in the parish of Kylänmäki. Your Uncle Pentti has gone to work in
Sweden and left you his red-ochre house by the lake, a sauna, a tired cream-coloured van and a
Ruska 1300 coupé lying in about thirty-five pieces in the garage. Rebuild the car bolt by bolt,
keep yourself fed, rested and sane, and get it through the vehicle inspection in the village.

## Play

Open `dist/index.html` in a desktop browser (Chrome, Edge, Firefox or Safari with WebGL 2).
The page loads Three.js from the jsDelivr CDN, so the first load needs an internet connection.
A mouse and keyboard are required.

To rebuild from source:

```sh
npm install
npm run build        # writes dist/index.html
npm run dev          # builds and serves dist/ on http://localhost:8080
```

## What's in the game

- **Build the car.** Each part mounts on the car or on another part: the engine block before the
  cylinder head, the head before the carburettor, and so on. Carry a part to the car and a green
  outline shows where it goes; press E to fit it. Then switch to the wrench (F) and tighten every
  bolt. Loose parts rattle off on the road.
- **Tune it.** Adjust the carburettor mixture with the screwdriver, and set the ignition timing by
  loosening the distributor clamp and turning it. Fill the oil, the coolant and the tank.
- **Stay alive.** Hunger, thirst, fatigue, stress, bladder and dirt all rise over time. Eat, drink
  from the tap, sleep in your own bed, shower, pee (hold P), heat the sauna and throw löyly on the
  stones, or cool off in the lake. Neglect any of it and the local paper prints your obituary.
- **The village.** Drive the van to Kylänmäki for groceries, spark plugs, oil and coolant at
  Teppo's shop, fill up at the pump, and book the inspection (weekdays 8–16, 120 mk).
- **Money.** You start with 850 mk. Split firewood at the woodshed and ring Heikki to sell it.
  Return empty beer bottles for the deposit.
- **The world.** About 1.5 km × 1.5 km of lakes, birch and spruce forest, gravel roads, a
  highway with traffic, a farm with hay bales, a church, and bright summer nights where the sun
  barely sets. Sound is synthesized live: engines, birds, a corncrake at night and humppa on the
  radio.
- **Saving.** Sleeping saves automatically. You can also save from the pause menu. Saves stay in
  the browser you played in.

## Controls

| On foot | | Driving | |
|---|---|---|---|
| Move | W A S D | Key on / off | tap I |
| Sprint / crouch / jump | Shift / C / Space | Start engine | hold I |
| Use | E | Throttle / brake | W / S |
| Secondary action | X | Steer | A / D |
| Pick up, drop | Left mouse | Handbrake | Space |
| Throw | Right mouse | Gear up / down | R / F |
| Wrench on / off | F | Lights / horn / radio | L / H / N |
| Tighten / loosen bolt | Scroll up / down (or left / right mouse) | Camera | C |
| Pee | hold P | Get out | E |
| Car checklist | hold Tab | | |
| Map | M | | |

The automatic gearbox is on by default; turn it off in Settings to use R and F.

## Code layout

```
src/
  main.js            game loop, state, menus, vehicles in/out
  core/              input, synthesized audio, noise, procedural textures
  world/             terrain baking, roads, sky and sun path, forest, grass, buildings, town
  game/              player, hands (carry/use/wrench), vehicle physics, the project car,
                     props, survival needs, shop, inspection, traffic, save/load
  ui/                HUD, gauges, map, checklist, newspaper screens
tools/build.mjs      esbuild bundle into a single HTML file
```

All geometry, textures and sounds are generated at load time; the repository contains no
image or audio files.
