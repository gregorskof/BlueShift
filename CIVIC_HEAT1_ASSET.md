# Civic Cruiser asset required

The Heat 1 Civic Patrol gameplay and visual loader are implemented in `js/game.js`.

The model `assets/civic-cruiser.glb` still needs to be added to this branch before this feature is merged into `main`.

The optimized file (~10.5 MB) was prepared from the user-supplied `civicCruiserNFS.glb` model. The game is designed to fall back to its original patrol vehicle when the new file is not available, but the intended Civic model will not appear until this asset is included.

After adding the asset, verify Heat 1 rendering, roof lights, AI behavior, and switching to the original patrol at Heat 2–3 in a browser.
