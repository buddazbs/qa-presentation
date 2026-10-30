# BLENDER_HANDOFF.md — Neo-Tokyo Vertical Megastructure

## 1. Objective and source interpretation
Build an original Japanese cyberpunk megacity that can be rotated around a vertical axis and inspected during a downward camera movement. The supplied photographs establish the mood: dense high-rise canyons, layered elevated infrastructure, vertical neon advertisements, wet reflective surfaces, dark metal and concrete, atmospheric haze, and cyan/magenta/red/amber lighting.

Do not reproduce recognizable game locations, exact billboard placements, or third-party logos. Use invented symbols and abstract signage. Text that appears in generated images is not authoritative and must not be copied literally.

### Visual analysis
- **Architecture:** tall asymmetric towers, compact mid-rise blocks, cantilevered decks, ring-like structures, exterior service frames, bridges, elevated roads, rooftop antennae.
- **Scale:** extreme vertical scale with foreground infrastructure and multiple receding building layers.
- **Density:** high, but with readable silhouettes and deliberate gaps. Avoid a uniform wall of boxes.
- **Materials:** dark coated steel, aged metal, concrete, smoked glass, technical polymer, emissive screens, wet asphalt.
- **Lighting:** cool cyan/blue fill; magenta/pink and red accent sources; warm amber windows; fog used for depth rather than to hide missing geometry.
- **Signature details:** tall billboards, illuminated facade strips, service ducts, cable runs, skybridges, ventilation units, railings, wet floors and localized steam.

Generated images are style guides, not calibrated scans. Geometry and measurements below are explicit project defaults, not dimensions inferred from the photos.

## 2. Coordinate system and global dimensions
Use Blender metric units. One Blender unit equals one meter.

- Origin `(0, 0, 0)`: center of the city and center of the vertical rotation axis.
- Up axis: `+Z`.
- `+X`: east; `+Y`: north; `-Y`: default hero-camera approach direction.
- Overall city envelope: height `288 m`, from `Z=-144 m` to `Z=+144 m`.
- Maximum city radius: `124 m` (diameter `248 m`). *Revision R1; was 92 m.*
- Inner viewing shaft: radius `44 m` (R1; was 14 m). Only the slide spire `TWR-00` (lattice radius 2.6 m, R2) stands inside it; bridges cross it only on the side opposite the slide helix (section 13).
- Twelve radial architectural sectors: `30°` per sector. Each sector must have distinct tower silhouettes and lighting groupings.
- Six logical vertical modules: `48 m` per module, with boundaries at `Z=-144, -96, -48, 0, 48, 96, 144 m`.
- The modules are **logical organization units**, not capped standalone chunks. Continuous towers, vertical pipes, facade ribs, and cable routes must not visibly stop at a boundary. Keep geometry continuous across a boundary whenever possible. For independently exported modules, reserve a `1 m` seam-check band on either side and avoid duplicated coplanar surfaces.

Treat the dimensions as starting values. If an approved blockout changes them, update both this document and `scene_spec.json` together.

## 3. Overall spatial composition
Arrange the city around the central vertical axis. Keep most building mass between radii `46–124 m`, leaving the inner shaft clear for the presentation camera (R1). Use three depth bands:

1. **Inner band, 46–64 m:** inward-facing facade fragments, narrow towers, sign pylons, selected bridges and hanging service structures.
2. **Middle band, 64–94 m:** primary towers, mid-rise blocks, skybridges, elevated transit routes and large advertisement panels.
3. **Outer band, 94–124 m:** silhouette-defining towers, rooftop structures, exposed frames, technical platforms and occasional overhanging structures.

Avoid an even radial distribution. Build a rhythm of dense clusters, narrower corridors and occasional open voids. Main tower silhouettes must be distinguishable from at least eight azimuths.

### Vertical zones
- **Upper zone (`Z=+64…+144 m`):** spires, antennae, rooftop machinery, thin skybridges, long vertical facades and distant high-rise silhouettes.
- **Middle zone (`Z=-48…+64 m`):** highest density of signs, bridges, transit levels, balconies, glass sections, exposed structural frames and illuminated commercial facades.
- **Lower zone (`Z=-144…-48 m`):** industrial supports, service corridors, tanks, ducts, pipe bundles, maintenance platforms, narrow roads, exhausts and more frequent wet reflections.

Transitions must be gradual. Do not end the lower city at one flat ground plane. Let supports, utility conduits and facade ribs continue across logical module boundaries.

## 4. Scene collections
Create these collections and keep object naming stable:

- `00_REFERENCE` — orthographic images, supplied photos, generated concepts; never export.
- `01_BLOCKOUT` — simplified building masses, radial boundaries, camera guides and seam markers; never export.
- `10_MAIN_TOWERS` — silhouette-defining high-rises.
- `20_BUILDINGS` — mid-rise and utility blocks.
- `30_FACADES` — facade modules, window bands, balcony and service panels.
- `40_BRIDGES_PLATFORMS` — bridges, transit decks, ramps, catwalks and supports.
- `50_ROADS_INFRASTRUCTURE` — road segments, railings, ductwork, utility pipes and service platforms.
- `60_SIGNS_SCREENS` — billboards, sign frames, display planes and abstract glyph panels.
- `70_NEON_LIGHTS` — emissive strips and hero-render-only light helpers.
- `80_DETAILS` — vents, railings, access doors, clamps, brackets, antennas and small props.
- `90_CAMERAS_LIGHTING` — final camera, orthographic cameras, test lights and render rigs.
- `99_EXPORT` — optimized, joined or instanced export-ready objects only.

Use clear IDs from `scene_spec.json`. Keep shared source meshes in a reusable asset collection and place duplicates as linked instances where supported.

## 5. Core object specification
All sizes are initial dimensions in meters. Individual object positions and azimuths are design parameters to be finalized in the blockout; do not treat the following as geodetic measurements.

| ID | Type | Initial envelope | Construction notes |
|---|---|---:|---|
| `TWR-01` | Primary spine tower | `18 × 22 × 252` | Uneven stepped shaft, three setbacks, exposed side frame, narrow antenna crown, cyan vertical screen on one face and smaller warm windows on others. |
| `TWR-02` | Needle tower | `10 × 12 × 226` | Tapered upper 30%, two service rings, antenna mast, sparse light accents. |
| `TWR-03` | Stepped slab tower | `26 × 20 × 184` | Offset blocks, cantilevered decks, exposed truss on one side, large billboard bay. |
| `TWR-04` | Ring crown tower | `16 × 16 × 168` | Cylindrical core with two external ring platforms and service ladders. |
| `BLK-01` | Mid-rise urban block | `18 × 16 × 62` | Reusable facade grid, mixed window bands, balcony modules and service bays. |
| `BLK-02` | Dense commercial block | `24 × 20 × 82` | Layered signage, overhangs, narrow vertical shafts, rear-side detail required. |
| `UTL-01` | Industrial utility block | `22 × 18 × 30` | Large ventilation units, tanks, ducts, service doors and raised access platform. |
| `BRG-01` | Enclosed skybridge | `32 × 5 × 4` | Truss or enclosed corridor; both ends must connect to actual support faces. Vary span from 18–42 m through parameters. |
| `BRG-02` | Open catwalk | `20 × 2.2 × 1.2` | Grated deck, guardrail, cross-bracing, under-deck conduit. |
| `TRN-01` | Elevated transit deck | `42 × 8 × 2.2` | Reusable straight and curved segments, edge barriers, underside beams. |
| `FAC-01` | Standard facade module | `4 × 8 × 0.45` | Window group, panel frame, one optional service strip; use as linked instances. |
| `FAC-02` | Corner facade module | `4 × 8 × 0.6` | Wraps two sides without visible seams; use mirrored variant sparingly. |
| `SIGN-01` | Billboard assembly | `8 × 1.2 × 15` | Frame, emissive display plane, rear maintenance access and mounts. |
| `ROOF-01` | Rooftop equipment pack | `10 × 8 × 4` | Fan boxes, vents, antenna base, conduits; combine into a few meshes for export. |
| `PIPE-01` | Utility pipe bundle | variable | Three to six pipes, restrained bends, brackets every 3–5 m; avoid tiny circular bevels at long distances. |
| `NEON-01` | Emissive facade strip | variable | Thin plane or low-sided mesh with emissive material; real geometry only when silhouette matters. |

### Modeling order for towers
1. Establish footprint and major stepped volumes.
2. Add setbacks, ledges, platforms and roof silhouette.
3. Add major facade zones and exposed structural frames.
4. Add window and panel modules using instancing.
5. Add billboards and large emissive accents.
6. Add close-range vents, brackets, bolts and cables only where visible.

### Bridge construction
Build deck, underside beams, rails, supports and attachment plates as separate pieces before combining. Place bridge ends at target support surfaces. Add a minimum of two visible support relationships unless the bridge is explicitly cantilevered. Run an intersection and gap inspection from both ends.

## 6. Geometry vs material vs instance
Use **real geometry** for tower silhouettes, roof crowns, major cantilevers, large bridges, guardrails visible in silhouette, large pipes, antenna masts and billboard frames.

Use **materials/textures** for concrete breakup, corrosion, small panel seams, distant window variation, screen artwork, small scratches and shallow facade markings.

Use **instances** for repeated windows, facade strips, vents, lamps, cable clamps, standard rail modules and roof equipment. Prefer one shared mesh plus per-instance transform over many unique copies.

For details that are smaller than roughly 2–3 pixels at the target viewing distance, prefer a texture, atlas, or removal. Use geometry where shadows or silhouette changes are clearly visible.

Do not make every surface glossy. Keep broad structural surfaces matte or moderately rough; reserve strong reflectivity for wet ground, glass, coated metal edges and selected signage.

## 7. Material presets
Values are initial Principled BSDF settings. `Emission Strength` is a starting value for Blender; verify appearance after export because browser renderers and tone mapping differ.

| Material name | Base color | Metallic | Roughness | Emission color / strength | Use |
|---|---|---:|---:|---|---|
| `M_DarkMetal` | `#20272F` | 0.82 | 0.36 | none / 0 | Main structural panels, tower frames. |
| `M_WornSteel` | `#444A50` | 0.78 | 0.52 | none / 0 | Exposed beams, braces, brackets. |
| `M_Concrete` | `#454A50` | 0.05 | 0.84 | none / 0 | Large concrete cores and retaining walls. |
| `M_TintedGlass` | `#071923` | 0.28 | 0.18 | none / 0 | Smoked windows; prefer opaque dark glass for browser performance. |
| `M_CoatedPanel` | `#18222C` | 0.52 | 0.43 | none / 0 | Painted facade panels. |
| `M_CyanEmission` | `#00D9FF` | 0.05 | 0.25 | `#00D9FF` / 3.0 | Major cyan strips and selected screens. |
| `M_MagentaEmission` | `#FF2BBF` | 0.02 | 0.24 | `#FF2BBF` / 2.5 | Neon frames and screen accents. |
| `M_AmberEmission` | `#FF9B3D` | 0.03 | 0.30 | `#FF9B3D` / 2.0 | Windows, work lights and service beacons. |
| `M_RedEmission` | `#FF3548` | 0.02 | 0.28 | `#FF3548` / 2.1 | Warning strips and small accents. |
| `M_AsphaltDry` | `#11171B` | 0.02 | 0.62 | none / 0 | Road base and dark platforms. |
| `M_AsphaltWet` | `#151B22` | 0.03 | 0.18 | none / 0 | Hero-only wet floors; add a roughness mask rather than a glass-like surface. |
| `M_TechPolymer` | `#262D35` | 0.18 | 0.48 | none / 0 | Vent housings, service doors, plastic housings. |

Use texture atlases for compatible facade materials. Keep normal and roughness details subtle. Do not rely on full ray tracing for reflections. Use emissive textures plus restrained bloom in the final render; bloom may need to be recreated in the browser.

## 8. Lighting and cameras

### Final look-development camera
- Output: `1536 × 2304` (vertical 2:3).
- Focal length: `35 mm`.
- Camera location starting point: `(0, -142, -20)` (R1; was `(0, -108, -20)` — inside the outer band now). `HERO-DECK` gives the foreground railing.
- Target point: `(0, 0, +5)`.
- Use a low-to-mid eye line; include foreground railing or wet platform for scale.
- Avoid allowing a single billboard to occupy most of the frame.

### Rotation/descent camera
- Start at `(0, -150, +128)` and aim toward `(0, 0, +112)` (R1; was radius 118 — the rotating city reaches 124).
- Move camera height linearly from `Z=+128` to `Z=-128` over the test interval.
- Rotate `CITY_ROOT` around the world Z axis by 360°; run a separate static azimuth test at `0, 45, 90, 135, 180, 225, 270, 315°`.
- For each static angle, preserve lens, camera height and target offset.

### Orthographic cameras
Create `CAM_TOP`, `CAM_FRONT`, `CAM_BACK`, `CAM_LEFT`, `CAM_RIGHT`, and `CAM_BOTTOM`. Use orthographic projection for these. The top view must reveal the radial distribution, and elevation views must show the full height without perspective convergence.

### Lighting setup
For Blender look development, start with Eevee and a large cool key light, low-intensity neutral/blue fill and small area lights near a few important signs. Suggested starting point: broad area key `600 W`, size `30 m`; fill `180 W`, size `20 m`; warm local area lights `30–120 W` only near hero signage. **R1:** key and fill are sun lights (`2.6` and `0.8`): area lights of 600/180 W fall off with distance and do not reach across a 248 m city. A world volume is not used — in Eevee it absorbs sun light completely; depth comes from fog in the browser. Tune exposure before increasing emission.

Avoid placing one real light on every neon sign. The browser version should use emissive maps and a restrained environment/hemisphere light. In the final still render, a compositor glare node may add restrained bloom, but do not bake it into geometry and do not assume it exports to glTF.

## 9. Animation and continuity

- `CITY_ROOT.rotation_euler.z`: `0 → 2π` for a full 360° rotation.
- Descent camera: `Z=+128 → -128` across the approved animation duration.
- Keep all principal buildings in the scene throughout the full descent; do not use a flat ground cap as a substitute for the lower city.
- Divide the height into the six logical bands described in section 2. A band is organizational; it does not license visible seams.
- At each boundary (`-96, -48, 0, +48, +96 m`), inspect a `2 m` band centered on the boundary. Check continuous facade ribs, pipe bundles, tower shafts, cable routes and bridge supports.
- Any bridge crossing a vertical boundary must have endpoints and support geometry defined globally, not independently guessed in adjacent chunks.
- For repeated facade elements, vary window occupancy, sign color and panel mix using deterministic per-object seeds. Do not randomly alter major silhouette landmarks.

## 10. Browser and GLB optimization

Initial performance budgets are project targets, not universal renderer guarantees:
- Aim for `≤500k` triangles in the normal visible LOD; keep a high-detail desktop variant under `750k` visible triangles after profiling.
- Target `≤60` material/draw-call groups where feasible; treat `100` as a warning threshold.
- Use shared meshes and instancing for repeated objects.
- Use `2048²` atlases for large building families, `1024²` for props, and `512²` for small reusable detail sets unless profiling justifies higher resolution.
- Prefer opaque materials. Minimize alpha blending and layered transparent screens.
- Provide separate LOD exports or use an LOD workflow verified in the actual engine. Do not assume every glTF viewer supports `MSFT_lod`.
- Merge tiny static hardware into parent meshes when material assignments allow it.
- Remove hidden internal faces and unseen backface geometry only when the camera cannot expose them during rotation.
- Use consistent scale, apply transforms, recalculate normals and triangulate only as needed by the export target.

### glTF/GLB handoff constraints
- Use Principled BSDF materials compatible with glTF metallic-roughness.
- Use base color, metallic, roughness, normal, occlusion and emissive textures where supported.
- Avoid relying on Blender-only procedural nodes, compositor effects, Eevee-specific effects or unsupported shader nodes.
- Emission does not automatically illuminate nearby geometry in a browser; use environment/area lighting in the target renderer if required.
- Verify texture color spaces and export packed images.
- Keep transforms applied and the world Z up in Blender. glTF axis conversion is handled by the exporter; test the target viewer rather than manually rotating everything.
- Export `CITY_ROOT` and only `99_EXPORT` content. Exclude reference planes, blockout guides and technical cameras unless the viewer explicitly needs them.
- Validate the GLB in the intended browser renderer at desktop and mobile resolutions.

## 11. Required acceptance checklist

### Geometry and composition
- [ ] The city uses one coherent coordinate system and its dimensions match `scene_spec.json`.
- [ ] The 12 sectors have varied silhouettes and no obviously empty azimuth.
- [ ] The four primary towers remain distinguishable from all eight test angles.
- [ ] Every bridge terminates at a support or is explicitly designed as a cantilever.
- [ ] The lower zone contains real buildings, supports and service infrastructure.
- [ ] No tower, pipe bundle or major facade rib ends abruptly at a vertical boundary.
- [ ] Back sides of major towers contain deliberate geometry; no billboard-only fronts.

### Materials and visual quality
- [ ] PBR materials use the initial values or a documented revision.
- [ ] Emissive elements do not wash out nearby facade details.
- [ ] Roughness varies across metal, concrete, glass and wet floors.
- [ ] Neon color distribution is balanced; not every panel glows.
- [ ] The model remains readable with fog and bloom disabled.

### Rotation and descent tests
- [ ] Render exact azimuths `0°` through `315°` in `45°` steps from the same Blender scene.
- [ ] Compare frame bounds and camera lens to ensure a fair comparison.
- [ ] Render at least one frame from each vertical zone using the same camera trajectory.
- [ ] Render seam bands around `Z=-96, -48, 0, +48, +96 m`.
- [ ] No large voids appear during descent; no sudden density changes reveal chunk boundaries.

### Export
- [ ] GLB opens in the target browser without missing textures.
- [ ] Emission, base color, roughness and normals look acceptable after export.
- [ ] The model meets the agreed triangle and material budgets.
- [ ] The city rotates around `(0,0,0)` without unwanted offsets.
- [ ] The camera completes the vertical range without intersecting geometry unexpectedly.

## 12. What is still a project decision
The supplied images do not establish exact measurements, object coordinates, camera calibration, floor counts, structural engineering, or the real topology behind occluded areas. The coordinates and material parameters in this handoff are deliberate starting defaults. The blockout must be approved before detailed geometry is built. Once approved, update `scene_spec.json` and generate exact technical views from the actual Blender scene.

## 13. Revisions R1–R3 — slide spire for the QA Platform presentation (2026-10-29)
The city is the backdrop of the browser presentation `index.html` (Tower; until 2026-10-30 `tower.html`, the previous main page is `signal.html`). The slides hang on a tower at the city axis and the camera flies around it inside the shaft, so R1 widened the shaft and moved the city outward. R2 rebuilt the spire after review: in R1 it was a 14 m light-panelled cylinder that read as a white wall behind every slide, its crown filled the first frame, and the upper zone was nearly empty. `scene_spec.json` carries the same values (`revision`, `slide_mounts`, `TWR-00`).

- **TWR-00 slide spire (R2):** the axis column of R06, not a wall. Octagonal dark-metal core of radius `1.6 m` inside a four-leg braced lattice of radius `2.6 m` (X braces per 6 m bay), from `Z=-144` to `+114 m`. A slim collar ring with one hairline of light halfway between every two slides; two recessed cyan seams on the core. Stepped crown `+114…+131 m` (14 m above the first slide, outside its frame), a thin halo ring at the logo point `+136 m`, needle to `+128 m` below the logo.
- **Slide mounts:** 13 mounts; slide `i` sits at `Z = 100 − 18·i m`, azimuth `a = 0.95·i rad`, measured from +X towards −Y in Blender (in three.js after the glTF Y-up conversion: from +X towards +Z), centre radius `9.2 m`, facing outward, on a slim cantilever truss. The card centres and the logo point are exported as extras of `CITY_ROOT` (`slide_mounts_yup`, `logo_anchor_yup`, glTF Y-up meters): the GLB optimizer prunes empty leaf nodes, so the `MOUNT-xx` / `LOGO-ANCHOR` empties exist only in `city.blend`.
- **Browser scale:** presentation units = meters × 0.5 (`tower/citymodel.js` `CITY_SCALE`). `tower/main.js` keeps its own spiral constants (`SPIRAL`, `LOGO_Y = 68`) and warns in the console if the GLB mounts or logo point drift from them.
- **Camera clearance:** the presentation camera stays within radius `40 m`. No geometry between radius `5 m` and `44 m` except the slide mounts and the four open shaft walkways `BRG-02_SPIRE_*`, which sit between slides on the side opposite the helix and land on inner pylons `IPY-*` at radius 53 m.
- **Hero canyon:** a ±7° corridor in front of the hero camera (azimuth −90°) stays free of stacks and bridges, and both transit rings open there.
- **Upper zone (R2, R04 / R05A):** 16 needle towers `SPR-*` in the middle and outer bands — three tapering tiers to `+104…+128 m`, two saucer ring decks with a neon rim, a lattice spire with a beacon up to `+144 m`. Fill stacks reach `+100 / +136 / +144 m` by band.
- **Facade vocabulary (R2, R08 / R09):** per segment — floor ledges every 9.6–14.4 m, corner pilasters, an exposed X-braced truss bay on one face, balconies with rails on residential faces, a service core with a vertical light strip, exposed frame levels with a lit core between blocks; roofs carry the `ROOF-01` pack, AC units and a lattice mast with a beacon.
- **Screens and signs:** large portrait art screens `M_ScreenArt` (8 abstract panels: gradient sky, sun disc, ribbons, branch silhouette, invented glyphs; 2048² atlas) with bezel, brackets and a light bar, on faces looking into the shaft (R01, R05A); `SIGN-01` billboards on the atlases `M_SignAtlas_V/H`. No real characters, logos or recognisable artwork.
- **Windows:** four tiling facade materials `M_Facade_Office/Resid/Indus/Glass` (48 m tile, 20 × 20 bays of 2.4 m, base + emissive, lit windows banded per floor); warm amber interiors dominate, cyan is the accent (R01, R05B).
- **Transit:** TRN-01 decks at five and six levels, short trains with lit window bands.
- **Lights:** key and fill are sun lights; no world volume (in Eevee it swallows the sun). Depth in the browser comes from fog and `tower/atmos.js` (R3: sakura petals, mist, steam at the mounts, props.glb traffic on air lanes, searchlight beams).

### R3 (2026-10-29) — density, foundation, transport, real signs
Review of R2: the city read flat and floated in the void, the crown and transport were missing, signs carried invented glyphs, surfaces had no detail maps, the top of the frame was empty, rain instead of petals, and a white ring burned above the first slide. `scene_spec.json` → `revision` R3 lists the same changes.

- **Foundation `05_FOUNDATION` / FND-01:** deck slab to `R_MAX + 8 m` with a lit fascia; level B1 of girders, ring beams and columns with cables and an industrial facade ring; slab B2 with an overhanging wet service platform (rail, lamps), pipes and downlights; eight tapered legs to `Z_MIN − 150 m` with braces and red rings; a core under the shaft; plaza plinth and podiums with lit cornices at the stack bases.
- **Far city `25_FAR_CITY`:** 54 towers at 165–235 m and 60 at 255–340 m, up to `+360 m`, with needles, beacons, ring decks, neon corner strips and ads facing the axis; three air-route light chains. Fills the top of the frame in four depth planes (shaft → city → far ring 1 → far ring 2).
- **TWR-00 crown:** two decks with rails and brackets, three equipment pods with monitors and neon strips, three deck monitors, three dishes, three lattice masts at radius 10 m (152–166 m) with crossarms, panel antennas and beacons, hanging cables. Spire services: conduits with clamps on two legs; per collar a junction box, a monitor, a cyan strip and a grating landing with rail; red leg lights every third collar. **Removed:** the collar hairlines and the logo halo — under ACES both burned to white bands in the browser.
- **Signs:** atlases are baked from the original presentation, not invented: `atlas/atlas.js` imports `signal/signage.js` `signTexture` and ports the `signal/future.js` ad layout; `node atlas/bake.js` renders them in headless Chrome to `textures/src/{signs_v,signs_h,ads,monitors}.png` + `atlases.json` (rect, aspect, text). 25 vertical, 12 horizontal, 8 ads, 6 readable monitor UIs. Vertical blades protrude from the side faces, boxes carry a hood light, ads have bezel, brackets, catwalk and floodlights. `glyph()` / `sign_atlas()` are gone.
- **Materials:** detail maps (grime base, normal, metallic-roughness, 512²) for the metal, concrete, panel and asphalt families, repeating through the UVs every `DETAIL_TILE = 6 m`; facades get normal + MR maps (window recesses, seams, mullions, streaks). Darker graphite palette; world `#141b2c`.
- **Props `props.glb`:** VEH-01 courier 3.6 m, VEH-02 sedan 4.8 m, VEH-03 cargo 6.6 m, VEH-04 patrol 5 m — separate parts, glass cabin, head/tail lights, engine glow, individual paint and accents; PETAL — cupped, notched, 0.014 m thick, double-sided. In the browser (`tower/atmos.js`) both are instanced.
- **Air lanes:** `free_lanes()` samples candidate rings (every 6 m of radius from 50 m, the edge band 136–156 m, routes above the roofs) at 720 points, 1 m above the car origin, and keeps those `LANE_CLEAR = 3 m` from every exported surface; exported as `PROPS_ROOT` extras `air_lanes_m`. Cars of one lane share its speed (the slowest type), so they never overtake.

### R4 (2026-10-30) — the column of the main presentation, video screens, darker night
Review of R3: the tower top and the column did not match the main presentation (no dishes, no screens), the neon signs read blurred, the city was too bright.

- **TWR-00 is no longer modelled.** The column is the signal trunk of the main presentation, `tower/column.js` (a copy of `signal/column.js`, built in three.js): octagonal shaft with service panels and flanges, conduits, braced truss, a distribution module with a branch cable per slide, monitors with the platform log, satellite dishes and vertical signs between chapters, the levitation emitter with two counter-rotating rings under the logo. It stands on the plaza plinth (`Z_MIN + 2.5 m`). `build_spire()` keeps only the `MOUNT-xx` / `LOGO-ANCHOR` anchors; the lattice spire, its crown, mounts and the `BRG-02_SPIRE` shaft bridges are gone. The shaft check now allows nothing between 6.5 m and the shaft edge above the floor.
- **Signs read sharp:** the browser draws `M_SignAtlas_*`, `M_Ads`, `M_Monitors` as unlit textures without tone mapping (as `signage.js` does) with anisotropy 8. Through PBR emission 2.2–2.6 under ACES the saturated glyphs had clipped into blobs.
- **Large neon signs:** a `mega` kind in `build_signs()` — 3.5–5 m wide tategaki boxes on the shaft corners of tall faces, two-sided, with a neon tube frame, brackets and a service ladder. Rooftop signs are larger (5–8 m high) and more frequent.
- **Video screens:** `build_screens()` hangs 16:9 (14–24 m) and 9:16 (14–22 m) screens with bezel, brackets, catwalk and light bar; the face material `M_Video_<0..5>` is a channel. The browser (`tower/screens.js`) plays an animated canvas per channel: callback feed, signal oscilloscope, QA Platform ident, mock-server terminal, monitoring, tests in progress. Each `M_Video_*` carries a small texture of its own, otherwise gltf-transform folds it into the palette and the name is lost. The abstract `M_ScreenArt` panels are removed.
- **Darker night (browser):** walls × 0.6, windows × 0.42, neon × 0.6 (untextured neon arrives as `PaletteMaterial*`), fog `#0f0a1c`, darker sky.

### Build pipeline
`build_city.py` builds the whole scene from `scene_spec.json`, deterministically. Requires Blender 5.2 and, for the GLB compression step, Node (`npx`).

```bash
cd presentation/blender
node atlas/bake.js                                                   # sign/ad/monitor atlases (headless Chrome), once or after atlas.js edits
blender -b --factory-startup -P build_city.py -- --stage all        # build + export + renders (~4 min)
blender -b --factory-startup -P build_city.py -- --stage build      # city.blend + build_report.json
blender -b --factory-startup -P build_city.py -- --stage export     # ../tower/assets/city.glb, city_lite.glb, props.glb
blender -b --factory-startup -P build_city.py -- --stage render     # renders_blender/*.jpg (add --quick)
```

`build_report.json` records the automated checks: triangles per collection, materials, bridge spans, shaft intrusions, stacks per sector, stacks crossing each seam, and a ray test of the presentation camera at every slide (desktop, phone, mid-flight) against the exported geometry.

Export: one mesh per collection (joined, transforms applied) under `CITY_ROOT`; WEBP textures, `KHR_materials_emissive_strength`; then `npx @gltf-transform/cli@4 optimize` welds, quantizes (`KHR_mesh_quantization`) and applies `EXT_meshopt_compression`, decoded by the vendored `tower/vendor/libs/meshopt_decoder.module.js`. Without `npx` the uncompressed GLB stays and a warning is logged. `city_lite.glb` (phones, ≤4 cores) drops `80_DETAILS` and the open bridges `BRG-02`.

### R2 acceptance status
Verified by `build_report.json` and headless runs (Blender 5.2.3, Chrome):
- [x] Dimensions match `scene_spec.json` R2; shaft intrusions: none; bridge span violations: none.
- [x] 80 stacks, 5–8 per sector; 36 stacks cross the `+96 m` seam (R1: 7).
- [x] Presentation camera: no geometry between the camera and its slide in 38 tested poses.
- [x] Renders: hero, 8 azimuths from one camera with `CITY_ROOT` rotated, 6 orthographic, 3 descent zones, 5 seam bands, 3 slide poses, clay.
- [x] Budgets: about 308k triangles and 53 primitives (desktop), about 265k (lite), within 500k / 60; GLB 3.5 MB / 3.1 MB.
- [x] `tower.html` at 2560×1440, 1920×1080, 1440×900, 1280×720, 820×1180 and 390×844: GLB loads, all 13 cards and the overview render without console errors.

Still a judgement call (review the renders): facade surfaces are flat prisms with texture windows — the panel relief, rust and wet streaks of R10 are not modelled, and there are no normal maps.

### R3 acceptance status
Verified by `build_report.json` and headless runs (Blender 5.2.3, Chrome):
- [x] Shaft intrusions, bridge span violations and camera blocks (38 poses): none. 87 free air lanes.
- [x] Budgets: 392k triangles / 78 primitives (desktop), 349k (lite), within 500k; props 236–590 triangles each.
- [x] Renders B01–B10 incl. `B08_props`, `B09_foundation`, `B10_crown`.
- [x] `tower.html` at 2560×1440, 1920×1080, 1440×900, 1280×720, 820×1180 and 390×844: city + props GLB load, 13 cards, no console errors; 60 fps (headless Chrome, Apple GPU, rAF over 5 s).
- [ ] GLB size: 7.6 MB / 7.0 MB (R2: 3.5 MB). Tiling detail UVs fall outside [0,1], so gltf-transform keeps them float32; textures are WEBP.
