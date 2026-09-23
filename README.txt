BLUE SHIFT — ONLINE MULTIPLAYER

PLAY WITH A FRIEND
1. Open the same version of Blue Shift on both computers or phones.
2. Choose ONLINE MULTIPLAYER from the garage.
3. The host chooses a game mode and a map, then clicks CREATE ROOM.
   In PvP, the host also chooses whether to be the cop or the racer.
4. Share the room code or invite link. Your friend enters the code and clicks JOIN.
5. When both players are ready, the host clicks START CHASE.

Choose PvP (cop versus racer) or Co-op Escape (two racers versus AI police).
Both cars share one simulated world,
with physical collisions, nitro, steering, and the existing police car model.
The host runs the simulation and decides the result. The joining player has local
movement prediction with correction from the host. Both modes use starter cars;
PvP balances the police car's speed and power. Solo progression is unaffected.

WINNING — PVP
Cop: hold the racer within 9 metres while they are below 29 km/h for 3 seconds.
Racer: stay more than 140 metres away for 8 seconds, or survive for 3 minutes.
After a round, the host can choose REMATCH or SWAP SIDES, or change the game mode.

WINNING — CO-OP ESCAPE
Both players are racers. Four AI police start the pursuit, split into squads that
chase each player. Reinforcements can arrive every 30 seconds, up to eight units.
Both racers must stay more than 140 metres from every active cop for 8 seconds
at the same time to win together. Being clear alone does not win the round.
If either racer is below 29 km/h with a cop within 9 metres and a clear line of
sight for 3 seconds, the team loses. Each racer has a separate arrest meter.
There is no survival-time shortcut in co-op: both players must escape the police.
The HUD shows each player's police distance or arrest risk and shared escape
progress. Pausing, rematches, and switching game modes work for both players.
The host can change mode while waiting in the room or after a round.

MINIMAP
Vehicle arrows are 20 percent larger. Your own arrow is always orange, and the
other player's arrow is light green on your screen. Your friend sees their own
arrow in orange and yours in light green. AI police retain flashing blue/red arrows.

CONTROLS
WASD or arrows: drive. Shift: nitro. Space: handbrake.
B: look behind. C: camera. Esc or ROOM / PAUSE: pause the shared chase.
Touch driving buttons remain available on phones.
PvP cop support: V calls backup, M deploys a roadblock, N deploys a spike block.
The cop can also click or tap the three support buttons in the multiplayer HUD.
Support works whether the cop hosts or joins. Both players see the same units,
barriers, spikes, and tire damage. Cooldowns: V 20 seconds, M 30 seconds, N 90 seconds.
Up to 2 backup units and 3 blocks can be active. Roadblocks need the racer moving
along a clear straight; if placement is unavailable, the cooldown is not spent.
Spikes can puncture either player's tires and backup tires, so approach carefully.
Support and cooldowns pause with the chase and reset for each rematch or side swap.
Co-op racers cannot request police support.
Switching to another tab or window pauses both players. Keep the host's tab open.
If either player leaves or loses the connection, return to the room menu to reconnect.
Multiplayer support does not award solo reputation. The human cop must still be
within 9 metres to make the arrest. Both players should refresh after an update.

PUT THE GAME ON GITHUB PAGES — NO BUILD OR NPM REQUIRED
1. Unzip BlueShift-GitHub-Pages.zip on your computer.
2. Upload index.html and the css, js, and assets folders into your repository's
   publishing folder. Keep those folders next to index.html and keep their names.
   Upload the extracted files, not the ZIP itself. Include the license files and
   README; the optional .nojekyll file can be included as well.
3. In the repository, open Settings > Pages. If you use branch publishing, select
   the branch and folder containing index.html, then save.
4. Open the HTTPS address shown by GitHub Pages and share that address with friends.

All files in the hosting package are smaller than 25 MB. Asset links are relative,
so the package works at either username.github.io or username.github.io/repository/.

PACKAGE CONTENTS
index.html                 Page markup and asset attribution
css/styles.css             Original game styles
css/multiplayer.css        Multiplayer menu and HUD styles
js/vendor/peerjs.min.js    PeerJS connection library with its license
js/multiplayer.js          PvP/co-op rooms, networking, and shared chase rules
js/game.js                 Game, bundled dependencies, and multiplayer adapter
assets/cop-car.glb         Police car model
assets/driver.glb          Driver character model
assets/officer.glb         Police character model

index.html links to the separate CSS and JavaScript files and loads models from
the assets folder. No build step or package installation is needed. Open the game
through GitHub Pages or a local web server so the browser can load the models.

HOW MULTIPLAYER WORKS ON STATIC HOSTING
GitHub Pages serves the game files. The included PeerJS client uses the public
PeerJS Cloud service to introduce the two browsers. Game updates then travel over
a WebRTC data channel. There is no dedicated game server for you to deploy, no
account to create, and no API key to enter for the default connection service.
No camera or microphone is requested.

The game is hosted on GitHub Pages, but the connection service is external to it.
Internet access and PeerJS Cloud availability are required. Some mobile, school,
office, or restrictive router networks cannot make a direct WebRTC connection;
they may need a TURN relay. The room menu reports failures and lets you retry.
This is a friend-to-friend prototype: no public matchmaking, persistent rooms,
host migration, or competitive anti-cheat service is included.

OPTIONAL CUSTOM SIGNALING / RELAY CONFIGURATION
For a deployed service, set window.BLUESHIFT_PEER_OPTIONS in a script before the
multiplayer scripts. It is passed to new Peer(..., options), so PeerJS host, port,
path, secure, and config.iceServers can be supplied. Obtain TURN credentials from
your own service; do not commit private, long-lived relay credentials to a public
repository. Short-lived credentials should come from a separate trusted service.

DOCUMENTATION
GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
PeerJS: https://peerjs.com/client/getting-started
Connection requirements: https://peerjs.com/client/faq

The original game's license notices remain in index.html and js/game.js.
PeerJS 1.5.5 is MIT licensed; its license is included with this package.

VERIFICATION NOTE
The game and 3D assets were checked in Chromium. Multiplayer gameplay is tested
in two browser contexts with a local test transport, including PvP support,
co-op police targeting, independent player controls, shared victory and arrest,
rematches, mode changes, and both minimap perspectives. The test environment cannot
gather WebRTC network candidates or reach the public PeerJS connection service,
so an internet match between separate devices/networks remains to be verified.
The delivered game uses real PeerJS/WebRTC, not the local test transport.
