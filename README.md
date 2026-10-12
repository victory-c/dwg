# Gundam Musou: Side 7

A voxel Dynasty Warriors: Gundam tribute running in the browser with three.js. Pick Amuro's RX-78-2 Gundam, Kai's RX-77-2 Guncannon, an RB-79 Ball, a mass-produced RGM-79 GM, Riddhe's MSN-001A1 Delta Plus, Seabook's Gundam F91, Tobia's Crossbone Gundam X1 Kai or Char's own MSN-04 Sazabi and fight off a Zeon raid on Side 7: clear the plaza, take the three Zeon landing zones, defeat Denim and Gene, then drive off Char's red Zaku.

Inspired by [voxel-musou](https://github.com/mike007jd/voxel-musou), the Zhao Yun voxel musou demo. Models, animation, effects, audio and music are procedural and written from scratch. The only image assets are the pilot portrait sheets and the SD unit renders.

## Play

**https://jonathanjtan.github.io/dwg/** — keyboard, mouse, gamepad, or touch on a phone or tablet.

To run it locally, serve the folder with any static file server:

```bash
python3 tools/serve.py 8766
```

Then visit http://localhost:8766.

## Co-op: up to three pilots

Click **HOST CO-OP** on the title screen and send the invite link to up to two friends. Each guest picks a mobile suit on joining: any of the playable suits, or the co-op-only Guntank. Two players can fly the same suit. Guests can join from the lobby or mid-mission, and can change suits from the lobby between sorties. The host runs the whole simulation. Each guest's browser streams its input to the host and renders snapshots, peer to peer over WebRTC. [PeerJS](https://peerjs.com)'s free public broker is only used for the initial handshake.

The Guntank is Hayato's long-range support unit:

| Action | Keys |
| --- | --- |
| Drive (the treads turn the hull, the torso tracks targets) | WASD |
| Missile burst (the 4th press fires an 8-missile salvo) | J / left click |
| Twin 120mm cannon lob (after two bursts, a 6-shell barrage) | K / right click |
| Thruster hop / tread boost | Space / L, Shift |
| Full-burst SP attack | I / F |

A guest whose suit is destroyed redeploys after 8 seconds. The mission fails only if the host's suit falls.

To add a playable suit, write a `Hero` subclass (see `gundam.js`, or `ball.js` for one that isn't built like a humanoid) and add an entry to `ROSTER` in `roster.js`. The select screens and co-op pick it up from there. Entries marked `coop` are only offered to guests. `.claude/skills/add-playable-suit` walks through the whole process, footage study to deploy.

Connectivity: players connect directly, which works on most home networks. There's no TURN relay, so two players who are both behind strict or symmetric NATs (some corporate or mobile networks) may not be able to connect. For local testing, add `?localnet` to the URL to use a same-browser BroadcastChannel transport between tabs.

## The mission

Side 7 is laid out like a Dynasty Warriors: Gundam stage: big open fields (the plaza in the middle and three military yards) a few blocks apart, with boulevards and town blocks in between.

Zeon comes in squads, as in the game. Garrisons hold their posts until you come close. Then the mob packs in around you, the front rank at arm's length and the rest a body or two behind, and a few at a time step in to swing. Gunners on the edge of the crowd fire the odd short burst, one at a time. A red aim line shows where it will go, so you can step out of it. Commanders mostly fight hand to hand and paint the same line before they open fire.

The Federation's GM team fights beside you for the fields. GMs cut Zaku down at a fair clip (their kills clear the plaza too, though only yours count as KOs), Zeon splits its attention between you and them (the front rank still comes for you, the rest of the mob turns on GMs that reach it), and squad leaders and commanders turn on GMs that press them while you're not in their face. The GMs can wear a commander down and take a landing zone whose squad leader they fell (announced as TAKEN BY ALLIES), but an officer or Char only falls to you.

1. **The plaza.** Four squads meet you as you land. Clear 50 Zaku.
2. **Landing zones.** Three supply pods drop into the military yards, each with a garrison and a squad leader. Pods keep dropping reinforcements until you defeat the squad leader and take the zone. An on-screen marker and the minimap point to the nearest one.
3. **Denim, then Gene.** Commander-type Zaku arrive with a camera cut and name card.
4. **Char.** Drive off the Red Comet.

Staying alive:

- **Armor recovery:** part of every hit (the striped red segment of the HP bar) repairs itself if you avoid damage for a few seconds.
- **Repair kits** drop every 20 KOs or so, and sooner when you're hurt. Squad leaders and commanders drop large kits. Kits drift toward you when you're close.
- Zaku telegraph their heat hawk swings with a glint. A red glint means the blow is real.

## Controls

New to it? **TRAINING** on the title screen walks you through every essential control in a dozen quick drills (move, look, jump and hover, boost, the attack string, charge attacks, the charge shot, dash and air attacks, SP and lock-on), with your chosen suit, against soft Zaku that can't bring you down. Each drill shows the buttons for whatever you're playing on: keyboard, gamepad or touch.

| Action | Keyboard / mouse | Gamepad | Touch |
| --- | --- | --- | --- |
| Move | WASD | Left stick | Left thumb, anywhere on the left half |
| Camera | Mouse (click to lock), Q / E, wheel to zoom | Right stick (LT recenters) | Drag the right half |
| Lock on to a commander (again to release) | R / middle click | Right stick click | LOCK |
| Attack | J / left click | X / Square | ATK |
| Charge attack (hold for a charge shot; keep holding through a charge attack to follow it with one) | K / right click | Y / Triangle | CHG |
| Jump (hold to hover on the thrusters) | Space | A / Cross | JUMP |
| Boost dodge (hold to boost dash, keep holding to sprint) | L / Shift | B / Circle | BOOST |
| SP attack (hold for the charge SP) | I / F | RB / R1 | SP |
| Pause, sound on/off, hide keys | Esc, M, H | Start | ⏸ (sound lives in the pause menu) |

**SP** works as in Reborn: the gauge under the HP bar holds three stocks, filling as you land hits and take them. The ground and aerial SP each spend one stock. Hold SP through the starburst for the charge SP: the suit crouches in a cyan aura, and every 0.6 s you keep holding commits another banked stock (they turn orange on the bar). The charge SP lasts longer for every stock it takes; for a suit whose charge SP can't run longer, each stock makes it hit harder instead. An E-CAP pickup refills one stock.

Sound starts off. Press M, or use the SOUND button in the pause menu, to turn it on. On touch there is no M key, so there is a SOUND button on the title screen next to FULLSCREEN and a speaker toggle in the HUD beside the pause button; all of them stay in step.

**Lock-on** works on commanders only: squad leaders, Denim, Gene and Char. Press R to lock on to the one nearest the middle of the view. The camera swings round behind you to keep it in frame, attacks and shots aim at it while it's in reach, and a red reticle marks it (pinned to the screen edge when it's out of view). While locked on, your suit keeps facing the target: left and right strafe round it, back backs off, and boost dashes, the boost sprint and dodges strafe the same way. Press R again to let go. With no commander around, R recenters the camera.

### Touch

Hold the phone sideways. The movement stick appears wherever your left thumb lands and follows it if you drag past the ring, so you never run out of travel; drag anywhere on the right half to swing the camera. The action buttons sit in a diamond under your right thumb and hold exactly like the keys do — hold BOOST to dash (and keep holding to sprint), JUMP to hover, CHG to charge a shot, SP for the charge SP. The SP button lights up whenever a stock is ready. Lock-on is worth leaning on here: it aims your attacks for you and saves a lot of camera work.

The combo guide starts **off** on touch, since it is a lot of a phone screen; turn it on from the pause menu and it comes back as a compact two-column strip along the top, labelled ATK / CHG rather than J / K, and it fades out of the way whenever a radio line is on screen. Double-tap-to-zoom and pinch are refused everywhere, including in the menus, because a stray zoom leaves the game in a viewport it cannot draw to and iOS Safari ignores `user-scalable=no`.

If the game is silent on an iPhone even with sound on, it used to be the ring/silent switch: Web Audio defaults to the "ambient" session, which that switch mutes however loud the volume is. The game now asks for the playback session (`navigator.audioSession`, Safari 16.4+) so the switch no longer applies, and plays a silent frame on the first tap, which some iOS versions need before any sound comes out at all.

Tap **FULLSCREEN** on the title screen, or sortie — the game asks for fullscreen and a landscape lock on the way in, which is worth a third of the screen back from the browser's address bar and tab strip. iPhone Safari supports neither, so there the game offers **Share → Add to Home Screen** instead; launched from the home screen it runs without browser chrome. Rendering is capped at 1x device pixels on touch devices and steps down to 0.5x if frames get long.

## Mobile suits

LAUNCH opens the mobile suit select. A / D or the arrow keys choose, Enter sorties, and the choice is remembered for next time. On touch, tap a card to select it and SORTIE to launch; the combos are listed as button names rather than keys. The movesets follow *Dynasty Warriors: Gundam Reborn*, with reach scaled from gameplay footage in suit heights. The select screen and the combo guide tag each move with where it comes from: **RB** is shown in Reborn's move footage, **DWG** comes from the earlier *Dynasty Warriors: Gundam* games' move lists, and **NEW** is made up for this game. The suits aren't evenly matched: the Ball is the weak one, and the GM sits a step below the Gundam. Charge attacks change with how far into the combo you are.

### RX-78-2 Gundam (Amuro Ray)

Amuro's moveset follows the RX-78-2's in *Dynasty Warriors: Gundam Reborn*, checked beat by beat against its move footage, with its two beam sabers, beam rifle, beam javelin, hyper bazooka, shield and Gundam hammer. Reach is scaled from gameplay footage: the saber blade is about 1.3 Gundam heights long, as in the game. Charge attacks change with how far into the combo you are:

- **J × 6**: six saber cuts. The sixth is a thruster hop into a full-circle cut that launches everything around you.
- **K**: beam rifle shot. Mash it for a shot combo, or hold it for a charge shot that throws its target.
- **J K**: a cut into a rising launcher, then the beam javelin thrust straight up into the airborne target. Press **K** again to swing the shield flat across the front
- **J J K**: the hyper bazooka comes off the back and fires five rounds point-blank
- **J J J K**: the second beam saber comes out: an overhead chop, a cut from each blade crossing in an X, then a thruster rush straight through the target
- **J J J J K**: a spin, then a huge rising crescent that carries the Gundam up with its target
- **J J J J J K**: the "Last Shooting" from the anime's final duel: the beam rifle held straight up and fired into the sky, and a shockwave races out along the ground about 2.8 Gundam heights around
- In the air (this game's own; Reborn's footage shows none): **J** aerial slash, **K** plunging slam
- During a boost dash: **J** dash rush (keep pressing J for up to 12 cuts and a launcher), **K** saber cuts on the move, a spinning cut and the hyper bazooka point-blank, **Space** boost jump

SP attacks: on the ground, a storm of beam javelin thrusts, then the javelin skewers its target, hoists it and slams it down, and purple lightning erupts. Hold SP through the starburst for the charge SP: the Gundam hammer, whirled around you on its chain, longer for every stock it takes (about 7 s of hammer with two). In the air, the Gundam hovers and shells the crowd with the hyper bazooka.

### RX-77-2 Guncannon (Kai Shiden)

Slower, with less armor but more defense than the Gundam (the game's spec sheet: armor 8429, mobility 667, thruster 790 against 10000, 800 and 1000). The right hand keeps the beam rifle (and bashes and hooks with it in the fist); the left fist and the feet do the rest of the close work, and the twin 240mm shoulder cannons swing down over the shoulders for everything heavy. As in the game, a blow lands a little past its swing arc, reaching about as far into a crowd as the Gundam's saber.

- **J × 6**: a rifle bash (the rifle swung like a club), right hook, stepping left straight, roundhouse, spinning back kick, then a thruster hop into a spin with both arms out that launches everything around it
- **K**: beam rifle. Mash it for a shot combo, or hold it for a charge shot: the suit braces and both cannons fire, blowing the target away
- **J K**: a flying knee that breaks guard, then the thrusters drive the knee on up and launch the target
- **J J K**: a thruster hop and a body slam that bounces everything around into the air; press K again and both cannons shell what it bounced up
- **J J J K**: the cannons level and pound the target point-blank: three salvos of both barrels
- **J J J J K**: braced on its thrusters, a rapid string of shells that juggles the target higher with every hit
- **J J J J J K**: grab, then the giant swing: round and round with the soldier as a club, and let go. Tap K during the swing for more turns
- In the air: **J** punch, **K** both cannons fired down at the ground ahead (neither is in the Reborn footage: this game's own)
- During a boost dash: **J J J** a flying kick, an air punch and a heel drop, **K** launch the target, blast it with both cannons as it comes down, and back-flip clear

SP attacks each spend one of the three SP stocks. On the ground, a storm of punches that walks forward for about five and a half seconds (afterimage fists), and a last blow that blasts the target away. Hold SP through the starburst for the charge SP: the suit crouches in a blue aura, committing another stock for every 0.8 s it's held, then fires shells out in every direction while it turns on the spot, about 2.6 s of barrage for each stock, and ends in a ring of blasts. In the air, the Guncannon hovers low and shells its target point-blank.

### RB-79 Ball (Ball Leader)

The Federation's mass-produced space pod: a sphere with a 180mm recoilless cannon on top and two manipulator arms. It's deliberately the weakest suit here: thin armor (the game's spec sheet: armor 9087, mobility 240), a slow drift and blows that land lighter than a real mobile suit's. Only its thrusters (904) keep up with the Gundam's. It floats instead of walking, and it fights by tumbling into the enemy claws first. The moves the Reborn footage shows are taken from it. The Reborn Ball has no charge attacks past J K (the footage and the Koei wiki agree), so J J K to J J J J J K, the jump attacks and the charge SP are this game's own, built from the same tools.

- **J × 6**: tumbling claw swipes (a diagonal swipe, a backhand, a forward somersault, a barrel roll, a flat spin), then a thruster backflip that launches everything in front
- **K**: the 180mm cannon. Mash it for a shot combo, or hold it for one heavy shell whose kick rocks the pod back and shoves it about its own width
- **J K**: dash in, a tumbling flurry of claw swipes, a gold flash and a rising cut that launches
- **J J K** (this game's own): arms tucked in, it rolls along the ground like a bowling ball
- **J J J K** (this game's own): a spinning top that drags the crowd in and flings it away
- **J J J J K** (this game's own): a launching swipe, then three cannon shells at the target in the air
- **J J J J J K** (this game's own): the meteor drop: straight up on the thrusters, then down body first into a shockwave
- In the air (this game's own): **J** a forward tumble, **K** the cannon fired down at the ground ahead
- During a boost dash: **J** spins along the ground with both arms out (keep pressing J) and ends in a launching flip, **K** about a second of spinning swipes, a violet flash, the cannon glowing gold, and a point-blank shell

SP attacks each spend one of the three SP stocks. On the ground, both arms flail in a blur for under two seconds while the pod pushes forward, and a point-blank shell ends it. Hold SP through the starburst for the charge SP (this game's own): the rest of the Ball squadron drops in from the colony sky, forms up round its leader and fires six volleys for each stock committed before peeling off. In the air, the Ball dives at its target and blasts it point-blank.

### RGM-79 GM (GM Team Leader)

The Federation's mass-produced answer to the Zaku, and a step behind the Gundam at everything (the game's spec sheet: melee 600, shot 600, defense 115, armor 9746, mobility 465, thruster 820; burst type "Pride of Mass Production"). It carries a pink beam saber, the short-range beam spray gun it holds at rest, and a long red shield it fights with as much as it hides behind. The Koei wiki has no GM page; its rule for mass-produced suits is one charge attack past K (J K) plus a dash charge, which is exactly what the Reborn footage shows, so the moves the footage shows are taken from it, and J J K to J J J J J K, the jump attacks and the charge SP are this game's own, built from the same saber, gun and shield.

- **J × 6**: quick paired saber cuts, about half a second a press, slowly advancing, and a fierce rising swipe that launches
- **K**: the beam spray gun. Mash it for up to five shots, 0.35 s apart, that make the target flinch; hold it for the charge burst: the thrusters hop the GM back about 0.4 of its height while it fires three heavy shots, the last of which throws the target
- **J K**: a flurry of cuts, a gold flash, the shield lit gold and driven into the target, then a low spinning cut that throws it high
- **J J K** (this game's own): three spread volleys from the spray gun, fanned across the front
- **J J J K** (this game's own): a thruster rush behind the shield that shoves everything ahead of it, then a saber thrust
- **J J J J K** (this game's own): a rising cut that carries the GM up with its target, then the spray gun fired down at it
- **J J J J J K** (this game's own): a thruster charge with the saber thrust out ahead, straight through the line
- In the air (this game's own): **J** a saber cut, **K** the spray gun fired down at the ground ahead
- During a boost dash: **J** a rush of cuts (keep pressing J) ending in a rising launcher, **K** a dashing flurry, a pink flash and a launching cut, a shot up at the falling target, then the saber thrust straight up into it

SP attacks each spend one of the three SP stocks. On the ground, a rising strike throws the target up, the spray gun fires into it and then across the front, and a green swirl ends it. Hold SP through the starburst for the charge SP (this game's own): the GM braces behind its shield and sweeps the spray gun left and right across the front, about 2.6 s for each stock committed, then a last heavy fan. In the air, it rams along the ground shield first on its thrusters, carrying its target, and ends in a teal burst.

### MSN-001A1 Delta Plus (Riddhe Marcenas)

A Zeta-lineage transformable suit from a full generation after everything else on this field, and taller than the Gundam (the game's spec sheet: melee 600, shot 600, defense 480, armor 10000, mobility 728, thruster 1000). It carries a beam saber (which also fixes onto the rifle as a bayonet), a beam rifle, a shield with two beam sabers and a grenade launcher built in, and the beam cannon it fires in its waverider flight mode. The moves follow its Reborn footage and the Koei wiki's Reborn list.

- **J × 4**: three beam saber cuts, then the shield's two sabers light and cut an X with the hand saber that knocks the target away
- **K**: the beam rifle. Mash it for up to five shots, or hold it for a charge shot behind the shield (the thrusters lift the suit a little after it, and it lands in a crouch)
- **J K**: a flip kick that launches, then two diagonal saber slashes in the air after the target
- **J J K**: a beam saber thrust from the shield. If it connects, press **K** again: a kick that launches, a leap after the target with two cuts, and two grenade rounds fired down into it
- **J J J K**: folds into waverider mode and barrel-rolls through the target in a long arc, landing in a shockwave
- **J J J J K** (this game's own): a big rising double cut that carries the target skyward
- In the air (this game's own): **J** a saber slash, **K** a plunging stab
- During a boost dash: **J J** four bayonet swings with the saber fixed on the rifle, ending in a grenade round; **K** cuts on the rush, a spin, and a point-blank grenade blast
- **Boost twice** (tap boost again during the quick boost): the Transform Shot. It folds into waverider mode and flies at the target, ramming whatever is in the way; **J** fires the beam cannon from the nose as it unfolds

SP attacks each spend one of the three SP stocks. On the ground, it folds into waverider mode and circles its target at speed for about four seconds, spinning up a vortex that catches everything inside, then climbs out, unfolds, and fires three rifle shots down into a huge explosion. Hold SP through the starburst for the charge SP (this game's own; Reborn's footage shows none): the same run circles about 3.5 s longer for each extra stock, into a bigger blast. In the air, it hovers low and pours a concentrated rifle beam into its target, then swings the beam sideways to sweep everything away.

### F91 Gundam F91 (Seabook Arno)

A compact Formula-project Gundam from four decades later, fast and thinly armored (the game's spec sheet: melee 600, shot 600, defense 373, armor 8406, mobility 528, thruster 740). It carries a yellow beam saber (and a second one for C4), a beam rifle, a beam shield off the left forearm, a beam launcher, and a pair of VSBRs on its back that swing forward under the arms. Its charge attacks and SPs flare with the teal-green afterimages of its M.E.P.E. burst. The moves follow its Reborn footage, checked against the Koei wiki's list (the same inputs as in DWG2 and 3).

- **J × 6**: a beam saber string, ending in a turning cut all the way round and a big rising slash that knocks the target back
- **K**: the beam rifle. Mash it for about six shots, or hold it for a charge shot: both VSBRs fire at once, and the heavy beams skid the F91 back about a third of its height
- **J K**: a cut, the beam shield ground into the target, a kick that launches it, then a rifle shot up into it
- **J J K**: a launching slash, then the VSBRs swing forward and one fires straight up into the target
- **J J J K**: both beam sabers out, spun like wheels at its sides as it glides forward through the target, then a spinning cut as it lands
- **J J J J K**: a spinning cut, then a lifting stab that drives through the target and carries both up into the air
- **J J J J J K**: a cut, then it rises into a hover and glides sideways while the VSBRs fire three volleys down at the target
- In the air (this game's own): **J** an air slash, **K** a plunging stab
- During a boost dash: **J** a dash rush (keep pressing J), **K** a long saber flurry on the rush, a rising cut that launches, and the beam launcher fired up into the target

SP attacks each spend one of the three SP stocks. On the ground, a long flurry of drawn-out saber sweeps across the crowd into a cross-slash and an M.E.P.E. flash. Hold SP through the starburst for the charge SP: the VSBRs swing forward and pour one sustained mega-beam ahead, steered with the stick, about 3.6 s of beam for each stock it takes, then one last full-power blast and the M.E.P.E. afterimages peel away. In the air, it hovers inside a swirling sphere of M.E.P.E. afterimages that pulls in and strikes everything around and below it.

### XM-X1 Crossbone Gundam X1 Kai (Tobia Arronax)

The Crossbone Vanguard's space-pirate Gundam, fifty-four years out of its time. It is as fast and hits as hard as the RX-78, but its armor is far thinner (the game's spec sheet: melee 600, shot 600, defense 150, armor 10000, mobility 800, thruster 1000). It carries a beam zanber and a second saber, a buster gun, a beam shield, a screw whip that lashes out and hauls its catch back in, and heat daggers in its feet. The X-shaped thrusters on its back each have their own exhaust. As in Reborn it wears the ABC mantle, sheds it for its attacks (not for the buster's shot combo) and has it back on half a second after. The Koei wiki has no entry for it (it's Reborn DLC), so its moves come from the footage alone.

- **J × 6**: a zanber string ending in a dual-blade cross-slash that launches everything around the suit
- **K**: the buster gun, fired from under the mantle. Mash it for about six shots, or hold it for the charge shot: the mantle comes off, the thrusters hop the suit back about 0.4 of its height, and the buster pours one sustained beam into the target with the thrusters blazing behind it
- **J K**: a rising launcher into a heat-dagger slam and its shockwave
- **J J K**: a rising cut, then the beam shield ground into the target for about two and a half seconds, a launching slash and a back-flip away
- **J J J K**: the screw whip lashes out and hauls its catch back into a short flurry
- **J J J J K**: launch the target and chase it up with a spinning flurry
- **J J J J J K**: the screw whip spun out into a widening vortex that pulls everything in, then a dash-through finish
- In the air (this game's own): **J** an air cut, **K** a heat-dagger plunge
- During a boost dash: **J** a rush of zanber cuts (keep pressing J), **K** about two seconds of spinning X-thruster rush, a slash, and the buster fired point-blank

SP attacks each spend one of the three SP stocks. On the ground, a dual-blade flurry that hauls stragglers in and a dashing cross-slash. Hold SP through the starburst for the charge SP: the screw whip spins out into a pulling vortex, about 2.1 s for each stock it takes, then a final lash. In the air, it hovers in its mantle while a pink energy orb swells round it, then the orb detonates across the field and leaves a pillar of light.

### MSN-04 Sazabi (Char Aznable)

Char's Neo Zeon flagship from Char's Counterattack, flown against his own younger self. It is the biggest suit on the field and one of the slowest, with the Gundam's melee and shot but less defense and far less mobility (the game's spec sheet: melee 600, shot 600, defense 368, armor 10000, mobility 559, thruster 1000). It carries a beam tomahawk, a beam shot rifle, six funnels that fly off its backpack, missiles, and a mega particle cannon in its belly.

- **J × 6**: beam tomahawk cuts ending in a rising thruster slash that launches
- **K**: the beam shot rifle, slow and heavy. Mash it for a shot combo, or hold it: the Sazabi boosts in, stabs its target into the air, and the funnels converge on it
- **J K**: a tomahawk spin, then the mega particle cannon point-blank. Press **K** again for a turning cut and a thruster dash that drives the tomahawk up through the target and carries it into the air
- **J J K**: cuts into a launcher, then all six funnels surround the catch and fire at once
- **J J J K**: a thruster-driven spin sweep
- **J J J J K**: a rising flurry on the thrusters
- **J J J J J K**: cuts and a spin, then the funnels ring the suit and fire in every direction
- In the air (this game's own; Reborn's footage shows none): **J** a tomahawk chop, **K** a missile volley at the ground
- During a boost dash: **J** a rush of tomahawk cuts that ends with the whole suit slamming down and skidding along on its front (keep pressing J), **K** tomahawk cuts on the move, a spin, an uppercut that launches, then from the hover one heavy shot rifle beam straight up into the catch

SP attacks: on the ground, the funnels spread out over the field and rain beams while the shot rifle picks off the rest, then they come home, line up in front of the Sazabi and fire down the line. Hold SP through the starburst for the charge SP: a tomahawk frenzy on the thrusters with the funnels firing all around, about 3.3 s for each stock it takes, then a last rising cut and the funnels closing round the catch to fire at once. In the air, it hovers and hammers the ground with the shot rifle, then ends with one green-white burst.

The boost gauge under the SP bar drains while you dash or hover and refills once the thrusters rest. Keep holding boost after the dash runs out and the suit settles into a **boost sprint**, skating on its thrusters at about twice its running speed without using the gauge. It's the quick way from one field to the next, and attacks come out of it as dash attacks.

## How it's built

- `src/core/voxel.js`: voxel models authored with box, ellipsoid and mirror operations, then meshed with face culling, baked ambient occlusion, and greedy merging for the static town.
- `src/core/sculpt.js` and `src/models/`: every mobile suit is modelled from reference renders, resolution-independently. Parts are blocked out as solid shapes in design units (front, side and top silhouettes extruded and intersected, rounded boxes, cylinders, rotated and mirrored pieces, pixel-art decals projected onto armour) and voxelized at any density: the playable suits and officers at twice the density of the Zaku crowd, which uses the same Zaku model at the coarser grid. `tools/turnaround.sh` renders any suit's front, side, back and 3/4 views to a PNG with headless Chrome, for side-by-side checks against reference.
- `src/core/rig.js`: a 13-part humanoid rig with keyframed pose clips. It drives both Object3D rigs (the player suits and the commanders) and `InstancedMesh` crowds of up to 300 Zakus.
- `src/game/`: the player suit controller (`hero.js`: locomotion, boost, the attack runner and the SP state machine), the playable suits (`gundam.js`, `guncannon.js`, `ball.js`, `deltaplus.js`..., each with its moveset in a `*_moves.js`: poses, hit shapes, weapon timelines, timed effects, and its model in `src/models/<id>.js`), the roster every player picks from (`roster.js`), the Guntank (`tank.js`), squad AI with attack tokens, a front-rank cap, rationed and telegraphed gunfire, and grabs (`crowd.js`), landing zones (`bases.js`), officers and Char, combat, projectiles, the stage script, and the training drills (`tutorial.js`, which stands in for the stage script).
- `src/net/net.js`: co-op networking for the host and up to two guests. Guest input arrives as a world-space move direction plus pressed and held buttons. The crowd is packed into an Int16Array per snapshot, and effect, sound and HUD events are replicated.
- `src/fx/fx.js`: instanced cube particles for sparks, fire, smoke, embers and debris, anime impact stars, beam afterglow, ground scorch decals, shockwave rings and the Catmull-Rom smoothed saber ribbon trail.
- `src/audio/sfx.js`: the sound bank. Every effect is synthesized at load in an `OfflineAudioContext`, several takes per sound, each tuned differently, so no two triggers in a row are identical. Each saber move has its own voice, and the slash sweeps across the stereo field with the blade. Hits, footsteps, boosts and explosions are layered from a transient, a saturated body, ringing armor resonances, debris crackle and a low push. The weapon voices are tuned to *DW: Gundam Reborn*'s gameplay audio, measured band by band. Beams buzz around 160 Hz. Saber hits crunch near 2 kHz and ring at the game's armor partials between 0.7 and 1.15 kHz. There is little air above 6 kHz. The Guncannon's blows are a 300-400 Hz thump with a thin swish on top, and its 240mm cannons boom at 100-200 Hz under a bright 1.5-4 kHz blast. The Ball's claws clank with a ring near 1 kHz, and its 180mm recoilless cannon sits mostly under 300 Hz with a 2-3 kHz crack and the hiss of its back-blast. The Sazabi's shot rifle puts half its weight in a 70-86 Hz body under a zap near 2 kHz, and its funnels fire small beams near 590 Hz with a 2.4 kHz zing. The GM's beam spray gun is a short, thick report, about 60% in a 65 Hz thump and a 170-190 Hz buzz, with a 330-520 Hz growl and a small zap near 2.1 kHz.
- `src/audio/audio.js`: plays the bank's takes, panned against the camera and dulled with distance, through a generated colony-hall reverb. It also runs the continuous beam-saber hum and thruster roar, and falls back to live synthesis until the bank is ready.
- `src/audio/music.js`: the score, synthesized live: original pieces in the style of late-70s anime orchestral funk, with a brass section (trumpets, horns, chord stabs), strings, a plucked funk bass, glockenspiel, timpani and a march-funk kit. The battle theme is transcribed from a reference track onto that band: an A minor riff over a pumping pedal bass and a four-on-the-floor kick, which later climbs a half step to Bb minor. There's also a boss theme for Char, a title theme, and victory and defeat stingers.
- `src/world/world.js`: the Side 7 town (a boulevard grid with four open fields cut out of it) and the O'Neill cylinder shell curving up into the sky. Static props are baked into one mesh per 60-unit chunk, and colliders sit in a lookup grid.
- `src/post.js`: the MSAA HDR target, capped bloom, depth of field, grade and dither.

## Credits

- Several feel and rendering techniques are adapted from [voxel-musou](https://github.com/mike007jd/voxel-musou) (MIT, © 2026 BubuAi): the lens-side crowd clear and lens-clear shader, hero-local hit-stop with victim shudder, hit tint and flinch variants, the launch apex float and bounce, wind-up telegraphs with feints, and the post chain (square-bokeh DoF, split-tone grade, ordered-dither retro finish).
- Pilot portraits come from The Spriters Resource: Amuro Ray from *SD Gundam G Generation* (PlayStation, ripped by Arima); Bright Noa, Hayato Kobayashi, Kai Shiden, Seabook Arno, Tobia Arronax, Char (both his 0079 and Char's Counterattack cut-ins), Denim, Gene, the Ball squad leader and the GM team leader (generic Federation pilots) from *SD Gundam G Generation Wars* (PlayStation 2); and Riddhe Marcenas from *SD Gundam G Generation World* (PSP). See `assets/portraits/README.md` to add more pilots.
- The SD unit renders on the select cards and HUD come from the *G Generation Wars* unit sheets, and the Delta Plus from *SD Gundam G Generation Genesis* (`assets/units/README.md`).

## Disclaimer

This is a non-commercial fan project. Mobile Suit Gundam and all related names are © Sotsu · Sunrise. It is not affiliated with Sotsu, Sunrise or Bandai Namco.
